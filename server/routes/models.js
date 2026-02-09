import { getDatabase } from '../services/database.js';
import crypto from 'crypto';

/**
 * Model management API routes
 */
export function registerModelRoutes(app) {
    const db = getDatabase();

    // Provider Connections
    app.get('/api/connections', (req, res) => {
        try {
            const connections = db.prepare('SELECT * FROM provider_connections ORDER BY created_at DESC').all();

            res.json(connections.map(c => ({
                id: c.id,
                providerId: c.provider_id,
                name: c.name,
                apiKey: c.api_key,
                baseUrl: c.base_url,
                isActive: !!c.is_active,
                createdAt: c.created_at,
                updatedAt: c.updated_at
            })));
        } catch (error) {
            console.error('Error fetching connections:', error);
            res.status(500).json({ error: 'Failed to fetch connections' });
        }
    });

    app.post('/api/connections', (req, res) => {
        try {
            const { id, providerId, name, apiKey, baseUrl, isActive = true } = req.body;

            if (!providerId || !name) {
                return res.status(400).json({ error: 'Provider and name are required' });
            }

            const connectionId = id || crypto.randomUUID();
            const now = Date.now();

            db.prepare(`
        INSERT INTO provider_connections (id, provider_id, name, api_key, base_url, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          provider_id = excluded.provider_id,
          name = excluded.name,
          api_key = excluded.api_key,
          base_url = excluded.base_url,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `).run(connectionId, providerId, name, apiKey || null, baseUrl || null, isActive ? 1 : 0, now, now);

            res.status(201).json({ id: connectionId, createdAt: now, updatedAt: now });
        } catch (error) {
            console.error('Error saving connection:', error);
            res.status(500).json({ error: 'Failed to save connection' });
        }
    });

    app.delete('/api/connections/:id', (req, res) => {
        try {
            const { id } = req.params;
            db.prepare('DELETE FROM provider_connections WHERE id = ?').run(id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting connection:', error);
            res.status(500).json({ error: 'Failed to delete connection' });
        }
    });

    // Model Profiles
    app.get('/api/profiles', (req, res) => {
        try {
            const profiles = db.prepare('SELECT * FROM model_profiles ORDER BY created_at DESC').all();

            res.json(profiles.map(p => ({
                id: p.id,
                providerConnectionId: p.connection_id,
                modelId: p.model_id,
                displayName: p.display_name,
                defaultPrompt: p.default_prompt,
                temperature: p.temperature,
                maxTokens: p.max_tokens,
                inputPricePerMillion: p.input_price_per_million,
                outputPricePerMillion: p.output_price_per_million,
                isActive: !!p.is_active,
                createdAt: p.created_at,
                updatedAt: p.updated_at
            })));
        } catch (error) {
            console.error('Error fetching profiles:', error);
            res.status(500).json({ error: 'Failed to fetch profiles' });
        }
    });

    app.post('/api/profiles', (req, res) => {
        try {
            const {
                id,
                providerConnectionId,
                modelId,
                displayName,
                defaultPrompt,
                temperature,
                maxTokens,
                inputPricePerMillion,
                outputPricePerMillion,
                isActive = true
            } = req.body;

            if (!providerConnectionId || !modelId || !displayName) {
                return res.status(400).json({ error: 'Connection, model, and display name are required' });
            }

            const profileId = id || crypto.randomUUID();
            const now = Date.now();

            db.prepare(`
        INSERT INTO model_profiles (
          id, connection_id, model_id, display_name, default_prompt, temperature, max_tokens,
          input_price_per_million, output_price_per_million, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          connection_id = excluded.connection_id,
          model_id = excluded.model_id,
          display_name = excluded.display_name,
          default_prompt = excluded.default_prompt,
          temperature = excluded.temperature,
          max_tokens = excluded.max_tokens,
          input_price_per_million = excluded.input_price_per_million,
          output_price_per_million = excluded.output_price_per_million,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `).run(
                profileId,
                providerConnectionId,
                modelId,
                displayName,
                defaultPrompt || null,
                temperature ?? null,
                maxTokens ?? null,
                inputPricePerMillion ?? null,
                outputPricePerMillion ?? null,
                isActive ? 1 : 0,
                now,
                now
            );

            res.status(201).json({ id: profileId, createdAt: now, updatedAt: now });
        } catch (error) {
            console.error('Error saving profile:', error);
            res.status(500).json({ error: 'Failed to save profile' });
        }
    });

    app.delete('/api/profiles/:id', (req, res) => {
        try {
            const { id } = req.params;
            db.prepare('DELETE FROM model_profiles WHERE id = ?').run(id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting profile:', error);
            res.status(500).json({ error: 'Failed to delete profile' });
        }
    });

    // Project Model Policies
    app.get('/api/policies/:projectId', (req, res) => {
        try {
            const { projectId } = req.params;
            const policy = db.prepare('SELECT * FROM project_model_policies WHERE project_id = ?').get(projectId);

            if (!policy) {
                return res.json({
                    projectId,
                    allowedModelProfileIds: [],
                    defaultModelProfileIds: [],
                    updatedAt: null
                });
            }

            res.json({
                projectId: policy.project_id,
                allowedModelProfileIds: JSON.parse(policy.allowed_profile_ids || '[]'),
                defaultModelProfileIds: JSON.parse(policy.default_profile_ids || '[]'),
                updatedAt: policy.updated_at
            });
        } catch (error) {
            console.error('Error fetching policy:', error);
            res.status(500).json({ error: 'Failed to fetch policy' });
        }
    });

    app.put('/api/policies/:projectId', (req, res) => {
        try {
            const { projectId } = req.params;
            const { allowedModelProfileIds = [], defaultModelProfileIds = [] } = req.body;
            const now = Date.now();

            db.prepare(`
        INSERT INTO project_model_policies (project_id, allowed_profile_ids, default_profile_ids, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          allowed_profile_ids = excluded.allowed_profile_ids,
          default_profile_ids = excluded.default_profile_ids,
          updated_at = excluded.updated_at
      `).run(
                projectId,
                JSON.stringify(allowedModelProfileIds),
                JSON.stringify(defaultModelProfileIds),
                now
            );

            res.json({ success: true, updatedAt: now });
        } catch (error) {
            console.error('Error saving policy:', error);
            res.status(500).json({ error: 'Failed to save policy' });
        }
    });
}

export default { registerModelRoutes };
