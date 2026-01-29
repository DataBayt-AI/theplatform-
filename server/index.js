import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { attachUser, requireRole } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(attachUser);

// Project routes (scaffolded for auth enforcement)
app.post('/api/projects', requireRole(['admin']), async (req, res) => {
    // TODO: persist project in DB
    const { name, description } = req.body || {};
    if (!name) {
        return res.status(400).json({ error: 'Project name is required' });
    }
    return res.status(201).json({
        id: crypto.randomUUID(),
        name,
        description: description || null,
        createdAt: Date.now()
    });
});

app.post('/api/projects/:id/upload', requireRole(['admin', 'manager']), async (req, res) => {
    // TODO: accept file payload + validate membership
    const { id } = req.params;
    return res.status(200).json({ ok: true, projectId: id });
});

app.post('/api/projects/:id/export', requireRole(['admin', 'manager']), async (req, res) => {
    // TODO: export logic + validate membership
    const { id } = req.params;
    return res.status(200).json({ ok: true, projectId: id });
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

        const { model, messages, temperature, top_p } = req.body;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages, temperature, top_p })
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

        const { model, messages, temperature, top_p } = req.body;

        const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages, temperature, top_p })
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
