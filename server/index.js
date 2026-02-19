import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { attachUser, requireRole, requireProjectRole, loadProject } from './middleware/auth.js';
import { initDatabase } from './services/database.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerUserRoutes } from './routes/users.js';
import { registerModelRoutes } from './routes/models.js';
import { registerCommentRoutes } from './routes/comments.js';

dotenv.config();

// Initialize database
initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(attachUser);

// Register API routes
registerProjectRoutes(app);
registerUserRoutes(app);
registerModelRoutes(app);
registerCommentRoutes(app);

// Legacy project param handler (for existing routes)
app.param('id', async (req, _res, next, id) => {
    // Skip if already handled by new routes
    if (req.project !== undefined) {
        return next();
    }
    next();
});

// Helper to get API key (prefer header, fallback to env)
const getApiKey = (req, envVarName) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }
    return process.env[envVarName];
};

// OpenAI Proxy
app.post('/api/openai/chat', async (req, res) => {
    try {
        const apiKey = getApiKey(req, 'OPENAI_API_KEY');
        if (!apiKey) {
            return res.status(401).json({ error: 'OpenAI API key is required' });
        }

        const { model, messages, temperature, top_p, max_tokens } = req.body;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages, temperature, top_p, max_tokens })
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        res.json(data);
    } catch (error) {
        console.error('OpenAI Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Anthropic Proxy
app.post('/api/anthropic/message', async (req, res) => {
    try {
        const apiKey = getApiKey(req, 'ANTHROPIC_API_KEY');
        if (!apiKey) {
            return res.status(401).json({ error: 'Anthropic API key is required' });
        }

        const { model, messages, system, max_tokens } = req.body;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({ model, messages, system, max_tokens })
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        res.json(data);
    } catch (error) {
        console.error('Anthropic Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// SambaNova Proxy
app.post('/api/sambanova/chat', async (req, res) => {
    try {
        const apiKey = getApiKey(req, 'SAMBANOVA_API_KEY');
        if (!apiKey) {
            return res.status(401).json({ error: 'SambaNova API key is required' });
        }

        const { model, messages, temperature, top_p, max_tokens } = req.body;

        const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages, temperature, top_p, max_tokens })
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        res.json(data);
    } catch (error) {
        console.error('SambaNova Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// OpenRouter Proxy
app.post('/api/openrouter/chat', async (req, res) => {
    try {
        const apiKey = getApiKey(req, 'OPENROUTER_API_KEY');
        if (!apiKey) {
            return res.status(401).json({ error: 'OpenRouter API key is required' });
        }

        const { model, messages, temperature, top_p, max_tokens } = req.body;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages, temperature, top_p, max_tokens })
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        res.json(data);
    } catch (error) {
        console.error('OpenRouter Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/openrouter/models', async (req, res) => {
    try {
        const apiKey = getApiKey(req, 'OPENROUTER_API_KEY');
        if (!apiKey) {
            return res.status(401).json({ error: 'OpenRouter API key is required' });
        }

        const response = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        res.json(data);
    } catch (error) {
        console.error('OpenRouter Models Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/anthropic/models', async (req, res) => {
    try {
        const apiKey = getApiKey(req, 'ANTHROPIC_API_KEY');
        if (!apiKey) {
            return res.status(401).json({ error: 'Anthropic API key is required' });
        }

        const response = await fetch('https://api.anthropic.com/v1/models', {
            method: 'GET',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        res.json(data);
    } catch (error) {
        console.error('Anthropic Models Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/openai/models', async (req, res) => {
    try {
        const apiKey = getApiKey(req, 'OPENAI_API_KEY');
        if (!apiKey) {
            return res.status(401).json({ error: 'OpenAI API key is required' });
        }

        const response = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        res.json(data);
    } catch (error) {
        console.error('OpenAI Models Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// SambaNova Models (for pricing/catalog lookup)
app.get('/api/sambanova/models', async (req, res) => {
    try {
        const apiKey = getApiKey(req, 'SAMBANOVA_API_KEY');
        if (!apiKey) {
            return res.status(401).json({ error: 'SambaNova API key is required' });
        }

        const response = await fetch('https://api.sambanova.ai/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        res.json(data);
    } catch (error) {
        console.error('SambaNova Models Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// Hugging Face dataset import proxy
app.post('/api/huggingface/datasets/import', async (req, res) => {
    try {
        const dataset = String(req.body?.dataset || '').trim();
        const requestedConfig = String(req.body?.config || '').trim();
        const requestedSplit = String(req.body?.split || '').trim();
        const parsedMaxRows = Number(req.body?.maxRows);

        if (!dataset) {
            return res.status(400).json({ error: 'dataset is required (e.g. username/dataset_name)' });
        }

        const datasetParam = encodeURIComponent(dataset);
        const splitsUrl = `https://datasets-server.huggingface.co/splits?dataset=${datasetParam}`;
        const splitsResponse = await fetch(splitsUrl);
        const splitsPayload = await splitsResponse.json();
        if (!splitsResponse.ok) {
            return res.status(splitsResponse.status).json({
                error: splitsPayload?.error || 'Failed to fetch dataset splits from Hugging Face'
            });
        }

        const splits = Array.isArray(splitsPayload?.splits) ? splitsPayload.splits : [];
        if (splits.length === 0) {
            return res.status(404).json({ error: 'No splits found for this dataset' });
        }

        const first = splits[0] || {};
        const resolvedConfig = requestedConfig || first.config;
        const splitForConfig = splits.find(s => s.config === resolvedConfig) || first;
        const resolvedSplit = requestedSplit || splitForConfig.split;

        if (!resolvedConfig || !resolvedSplit) {
            return res.status(400).json({ error: 'Unable to resolve dataset config/split' });
        }

        const resolvedSplitMeta = splits.find(s => s.config === resolvedConfig && s.split === resolvedSplit) || splitForConfig || first;
        const splitCountRaw = resolvedSplitMeta?.num_examples ?? resolvedSplitMeta?.num_rows ?? null;
        const parsedTotalRows = splitCountRaw === null ? NaN : Number(splitCountRaw);
        const totalRows = Number.isFinite(parsedTotalRows) && parsedTotalRows > 0 ? Math.floor(parsedTotalRows) : null;
        const maxRows = Number.isFinite(parsedMaxRows)
            ? Math.max(1, Math.floor(parsedMaxRows))
            : Number.POSITIVE_INFINITY;

        const chunkSize = 100;
        const rawRows = [];
        let offset = 0;

        while (rawRows.length < maxRows) {
            const remaining = Number.isFinite(maxRows) ? (maxRows - rawRows.length) : chunkSize;
            const length = Math.min(chunkSize, Math.max(1, remaining));
            const rowsUrl = `https://datasets-server.huggingface.co/rows?dataset=${datasetParam}&config=${encodeURIComponent(resolvedConfig)}&split=${encodeURIComponent(resolvedSplit)}&offset=${offset}&length=${length}`;
            const rowsResponse = await fetch(rowsUrl);
            const rowsPayload = await rowsResponse.json();
            if (!rowsResponse.ok) {
                return res.status(rowsResponse.status).json({
                    error: rowsPayload?.error || 'Failed to fetch dataset rows from Hugging Face'
                });
            }

            const chunkRows = Array.isArray(rowsPayload?.rows) ? rowsPayload.rows : [];
            if (chunkRows.length === 0) {
                break;
            }

            rawRows.push(...chunkRows);
            offset += chunkRows.length;

            if (chunkRows.length < length) {
                break;
            }
        }

        const normalizedRows = rawRows.map(item => {
            const row = item && typeof item === 'object' && 'row' in item ? item.row : item;
            if (row && typeof row === 'object' && !Array.isArray(row)) {
                return row;
            }
            return { text: row == null ? '' : String(row) };
        });

        const columnsSet = new Set();
        for (const row of normalizedRows) {
            Object.keys(row || {}).forEach(key => columnsSet.add(key));
        }

        return res.json({
            dataset,
            config: resolvedConfig,
            split: resolvedSplit,
            columns: Array.from(columnsSet),
            totalRows,
            rowCount: normalizedRows.length,
            rows: normalizedRows
        });
    } catch (error) {
        console.error('Hugging Face import proxy error:', error);
        return res.status(500).json({ error: 'Failed to import Hugging Face dataset' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
