import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { attachUser, requireRole, requireProjectRole, loadProject } from './middleware/auth.js';
import { initDatabase } from './services/database.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerUserRoutes } from './routes/users.js';
import { registerModelRoutes } from './routes/models.js';

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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
