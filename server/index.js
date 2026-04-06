import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { attachUser, requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { initDatabase } from './services/database.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerUserRoutes } from './routes/users.js';
import { registerModelRoutes } from './routes/models.js';
import { registerCommentRoutes } from './routes/comments.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerTemplateRoutes } from './routes/templates.js';
import { registerIAARoutes } from './routes/iaa.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Initialize database
initDatabase();

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({
    crossOriginEmbedderPolicy: false,  // needed for some asset loading
    contentSecurityPolicy: false       // set separately if needed; avoid breaking existing UI
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:8080'];
app.use(cors({ credentials: true, origin: allowedOrigins }));

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(attachUser);

// Rate limiting for auth endpoints
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10,
    message: { error: 'Too many login attempts, please try again later' },
    standardHeaders: 'draft-7',
    legacyHeaders: false
});
app.use('/api/auth/login', loginLimiter);

// Register API routes
registerProjectRoutes(app);
registerUserRoutes(app);
registerModelRoutes(app);
registerCommentRoutes(app);
registerNotificationRoutes(app);
registerTemplateRoutes(app);
registerIAARoutes(app);

// Legacy project param handler (for existing routes)
app.param('id', async (req, _res, next, _id) => {
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
app.post('/api/openai/chat', requireAuth, async (req, res) => {
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
app.post('/api/anthropic/message', requireAuth, async (req, res) => {
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

// Gemini Proxy
app.post('/api/gemini/generate', requireAuth, async (req, res) => {
    try {
        const apiKey = getApiKey(req, 'GEMINI_API_KEY');
        if (!apiKey) {
            return res.status(401).json({ error: 'Gemini API key is required' });
        }

        const { model, contents, generationConfig, systemInstruction } = req.body;
        if (!model) {
            return res.status(400).json({ error: 'Model is required' });
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents,
                generationConfig,
                systemInstruction
            })
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }
        res.json(data);
    } catch (error) {
        console.error('Gemini Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// SambaNova Proxy
app.post('/api/sambanova/chat', requireAuth, async (req, res) => {
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
app.post('/api/openrouter/chat', requireAuth, async (req, res) => {
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

app.get('/api/openrouter/models', requireAuth, async (req, res) => {
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

app.get('/api/anthropic/models', requireAuth, async (req, res) => {
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

app.get('/api/openai/models', requireAuth, async (req, res) => {
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

app.get('/api/gemini/models', requireAuth, async (req, res) => {
    try {
        const apiKey = getApiKey(req, 'GEMINI_API_KEY');
        if (!apiKey) {
            return res.status(401).json({ error: 'Gemini API key is required' });
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (!response.ok) {
            return res.status(response.status).json(data);
        }

        const models = Array.isArray(data?.models) ? data.models : [];
        const normalized = models
            .filter((item) => Array.isArray(item?.supportedGenerationMethods)
                && item.supportedGenerationMethods.includes('generateContent'))
            .map((item) => {
                const fullName = String(item.name || '');
                const shortId = fullName.startsWith('models/') ? fullName.slice('models/'.length) : fullName;
                return {
                    id: shortId,
                    name: shortId,
                    display_name: item.displayName || shortId,
                    description: item.description || '',
                    input_modalities: item.inputTokenLimit ? ['text'] : []
                };
            });

        res.json({ data: normalized });
    } catch (error) {
        console.error('Gemini Models Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// SambaNova Models (for pricing/catalog lookup)
app.get('/api/sambanova/models', requireAuth, async (req, res) => {
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
app.post('/api/huggingface/datasets/import', requireAuth, async (req, res) => {
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
            const splitsMsg = String(splitsPayload?.error || splitsPayload?.message || '').toLowerCase();
            const isIndexingErr = (
                splitsMsg.includes('job') ||
                splitsMsg.includes('heartbeat') ||
                splitsMsg.includes('generation') ||
                splitsMsg.includes('not yet supported') ||
                splitsMsg.includes('dataset is not supported') ||
                splitsMsg.includes('no module named') ||
                splitsMsg.includes('config not found') ||
                splitsMsg.includes('failed to read') ||
                splitsMsg.includes('cannot be loaded')
            );
            if (isIndexingErr) {
                return res.status(422).json({
                    error: "This dataset is not accessible via the Hugging Face Datasets Server. This usually means the dataset was never fully indexed (e.g. it uses a custom loading script, was recently uploaded, or is gated). Try a different dataset, or export your data as a CSV/JSON file and use the 'Local File' import option."
                });
            }
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

        // ── Classify HuggingFace datasets-server errors ────────────────────────
        const isHFIndexingError = (payload) => {
            const msg = String(payload?.error || payload?.message || '').toLowerCase();
            return (
                msg.includes('job') ||
                msg.includes('heartbeat') ||
                msg.includes('generation') ||
                msg.includes('not yet supported') ||
                msg.includes('dataset is not supported') ||
                msg.includes('no module named') ||
                msg.includes('config not found') ||
                msg.includes('failed to read') ||
                msg.includes('cannot be loaded')
            );
        };

        // ── Try parquet fallback via Hub API ───────────────────────────────────
        const tryParquetFallback = async () => {
            const parquetUrl = `https://huggingface.co/api/datasets/${datasetParam}/parquet/${encodeURIComponent(resolvedConfig)}/${encodeURIComponent(resolvedSplit)}`;
            const parquetRes = await fetch(parquetUrl, { headers: { Accept: 'application/json' } });
            if (!parquetRes.ok) return null;
            const parquetData = await parquetRes.json();
            // Returns array of { url, filename, size } objects
            const files = Array.isArray(parquetData) ? parquetData : null;
            if (!files || files.length === 0) return null;
            return files; // caller handles download
        };

        const chunkSize = 100;
        const rawRows = [];
        let offset = 0;
        let rowsFetchError = null;

        while (rawRows.length < maxRows) {
            const remaining = Number.isFinite(maxRows) ? (maxRows - rawRows.length) : chunkSize;
            const length = Math.min(chunkSize, Math.max(1, remaining));
            const rowsUrl = `https://datasets-server.huggingface.co/rows?dataset=${datasetParam}&config=${encodeURIComponent(resolvedConfig)}&split=${encodeURIComponent(resolvedSplit)}&offset=${offset}&length=${length}`;
            const rowsResponse = await fetch(rowsUrl);
            const rowsPayload = await rowsResponse.json();

            if (!rowsResponse.ok) {
                rowsFetchError = rowsPayload;
                break;
            }

            const chunkRows = Array.isArray(rowsPayload?.rows) ? rowsPayload.rows : [];
            if (chunkRows.length === 0) break;

            rawRows.push(...chunkRows);
            offset += chunkRows.length;
            if (chunkRows.length < length) break;
        }

        // ── Handle fetch errors / empty result ────────────────────────────────
        if (rowsFetchError || rawRows.length === 0) {
            const hfError = String(rowsFetchError?.error || '');

            if (isHFIndexingError(rowsFetchError)) {
                // Try parquet fallback — just report file URLs so user knows they exist
                let parquetHint = '';
                try {
                    const parquetFiles = await tryParquetFallback();
                    if (parquetFiles && parquetFiles.length > 0) {
                        parquetHint = ` The dataset has ${parquetFiles.length} parquet file(s) on the Hub but requires a token or direct download.`;
                    }
                } catch { /* ignore */ }

                return res.status(422).json({
                    error: `This dataset is not accessible via the Hugging Face Datasets Server. ` +
                        `This usually means the dataset was never fully indexed (e.g. it uses a custom loading script, was recently uploaded, or is gated).` +
                        parquetHint +
                        ` Try a different dataset, or export your data as a CSV/JSON file and use the "Local File" import option.`,
                    hfError,
                    suggestion: 'use_local_file'
                });
            }

            if (rawRows.length === 0 && !rowsFetchError) {
                return res.status(404).json({ error: `No rows found for split "${resolvedSplit}" in config "${resolvedConfig}".` });
            }

            return res.status(rowsFetchError ? 502 : 404).json({
                error: hfError || 'Failed to fetch dataset rows from Hugging Face',
            });
        }

        const encodeDatasetPath = (pathValue) => {
            return String(pathValue)
                .split('/')
                .filter(Boolean)
                .map(segment => encodeURIComponent(segment))
                .join('/');
        };

        const inferAudioMime = (pathValue) => {
            const lower = String(pathValue || '').toLowerCase();
            if (lower.endsWith('.mp3')) return 'audio/mpeg';
            if (lower.endsWith('.m4a')) return 'audio/mp4';
            if (lower.endsWith('.ogg')) return 'audio/ogg';
            if (lower.endsWith('.flac')) return 'audio/flac';
            return 'audio/wav';
        };

        const bytesToBase64 = (bytesValue) => {
            if (!bytesValue) return null;
            if (typeof bytesValue === 'string') return bytesValue;
            if (Array.isArray(bytesValue)) {
                try {
                    return Buffer.from(bytesValue).toString('base64');
                } catch {
                    return null;
                }
            }
            if (bytesValue?.type === 'Buffer' && Array.isArray(bytesValue.data)) {
                try {
                    return Buffer.from(bytesValue.data).toString('base64');
                } catch {
                    return null;
                }
            }
            return null;
        };

        const resolveAudioContent = (value) => {
            if (!value) return null;

            if (Array.isArray(value)) {
                for (const entry of value) {
                    const resolved = resolveAudioContent(entry);
                    if (resolved) return resolved;
                }
                return null;
            }

            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) return null;
                if (trimmed.startsWith('data:audio/')) return trimmed;
                if (/^https?:\/\//i.test(trimmed)) return trimmed;
                if (/\.(mp3|wav|m4a|ogg|flac)(\?.*)?$/i.test(trimmed)) {
                    if (trimmed.startsWith('/')) {
                        return `https://huggingface.co/datasets/${encodeURIComponent(dataset)}/resolve/main/${encodeDatasetPath(trimmed)}`;
                    }
                    if (!trimmed.includes('/')) return null;
                    return `https://huggingface.co/datasets/${encodeURIComponent(dataset)}/resolve/main/${encodeDatasetPath(trimmed)}`;
                }
                return null;
            }

            if (value && typeof value === 'object') {
                const src = typeof value.src === 'string' ? value.src.trim() : '';
                if (src) {
                    if (src.startsWith('data:audio/') || /^https?:\/\//i.test(src)) return src;
                    if (/\.(mp3|wav|m4a|ogg|flac)(\?.*)?$/i.test(src)) {
                        return `https://huggingface.co/datasets/${encodeURIComponent(dataset)}/resolve/main/${encodeDatasetPath(src)}`;
                    }
                }

                const url = typeof value.url === 'string' ? value.url.trim() : '';
                if (url) {
                    if (url.startsWith('data:audio/') || /^https?:\/\//i.test(url)) return url;
                    if (/\.(mp3|wav|m4a|ogg|flac)(\?.*)?$/i.test(url)) {
                        return `https://huggingface.co/datasets/${encodeURIComponent(dataset)}/resolve/main/${encodeDatasetPath(url)}`;
                    }
                }

                const path = typeof value.path === 'string' ? value.path.trim() : '';
                if (path) {
                    if (/^https?:\/\//i.test(path)) return path;
                    return `https://huggingface.co/datasets/${encodeURIComponent(dataset)}/resolve/main/${encodeDatasetPath(path)}`;
                }

                const bytes = bytesToBase64(value.bytes);
                if (bytes) {
                    if (bytes.startsWith('data:audio/')) return bytes;
                    const mime = inferAudioMime(path || url);
                    return `data:${mime};base64,${bytes}`;
                }
            }

            return null;
        };

        const normalizedRows = rawRows.map(item => {
            const row = item && typeof item === 'object' && 'row' in item ? item.row : item;
            if (row && typeof row === 'object' && !Array.isArray(row)) {
                const audioCandidates = ['audio', 'sound', 'clip', 'recording'];
                const entryList = Object.entries(row);
                const explicitContent = resolveAudioContent(row.content);
                const explicitAudio = resolveAudioContent(row.audio);
                const candidateAudio = entryList
                    .filter(([key]) => audioCandidates.some(candidate => key.toLowerCase().includes(candidate)))
                    .map(([, value]) => resolveAudioContent(value))
                    .find(Boolean);
                const audioContent = explicitContent || explicitAudio || candidateAudio || null;

                if (audioContent) {
                    return {
                        ...row,
                        type: 'audio',
                        content: audioContent
                    };
                }

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

// Serve built frontend (for packaged/production use)
const distPath = join(__dirname, '../dist');
if (existsSync(distPath)) {
    // Serve static assets but NOT index.html (we inject config into it below)
    app.use(express.static(distPath, { index: false }));

    // Inject runtime config into index.html so no secrets are baked into dist/
    app.get('/{*splat}', (_req, res) => {
        const indexPath = join(distPath, 'index.html');
        const html = readFileSync(indexPath, 'utf-8');
        const config = {
            supabaseUrl: process.env.SUPABASE_URL || '',
            supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
        };
        const injected = html.replace(
            '<head>',
            `<head><script>window.__CONFIG__ = ${JSON.stringify(config)};</script>`
        );
        res.setHeader('Content-Type', 'text/html');
        res.send(injected);
    });
}

// Centralized error handler — must be registered after all routes
app.use(errorHandler);

app.listen(PORT, () => {
    console.log(`\n  DataBayt Platform running at http://localhost:${PORT}\n`);
});
