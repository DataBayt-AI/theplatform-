import { getDatabase } from '../services/database.js';
import { requireAuth } from '../middleware/auth.js';

export function registerIAARoutes(app) {
    // GET /api/projects/:id/iaa?threshold=0.7
    app.get('/api/projects/:id/iaa', requireAuth, (req, res) => {
        try {
            const isAdmin = req.user.roles?.includes('admin');
            const isManager = req.user.roles?.includes('manager');
            if (!isAdmin && !isManager) {
                return res.status(403).json({ error: 'Managers and admins only' });
            }

            const db = getDatabase();
            const projectId = req.params.id;
            const threshold = Math.min(1, Math.max(0, parseFloat(req.query.threshold) || 0.7));

            // Verify project exists and user has access
            const project = db.prepare('SELECT id, manager_id FROM projects WHERE id = ?').get(projectId);
            if (!project) return res.status(404).json({ error: 'Project not found' });
            if (!isAdmin && project.manager_id !== req.user.id) {
                return res.status(403).json({ error: 'Not authorised for this project' });
            }

            // Fetch all IAA data points with their assignments
            const rows = db.prepare(
                `SELECT id, content, assignments FROM data_points
                 WHERE project_id = ? AND is_iaa = 1`
            ).all(projectId);

            // Fetch user names for annotation attribution
            const users = db.prepare('SELECT id, username FROM users').all();
            const userMap = Object.fromEntries(users.map(u => [u.id, u.username]));

            const items = [];
            let totalScoreSum = 0;
            let itemsWithEnoughAnnotations = 0;

            for (const row of rows) {
                let assignments = [];
                try { assignments = JSON.parse(row.assignments || '[]'); } catch { /* skip */ }

                const done = assignments.filter(a => a.status === 'done' && a.value != null);
                if (done.length < 2) continue;

                // Compute percent agreement = frequency of modal value / total done
                const freq = {};
                for (const a of done) {
                    const val = String(a.value).trim();
                    freq[val] = (freq[val] || 0) + 1;
                }
                const modalCount = Math.max(...Object.values(freq));
                const agreementScore = modalCount / done.length;

                itemsWithEnoughAnnotations++;
                totalScoreSum += agreementScore;

                items.push({
                    dataPointId: row.id,
                    contentPreview: (row.content || '').slice(0, 80),
                    annotatorCount: done.length,
                    agreementScore: Math.round(agreementScore * 1000) / 1000,
                    annotations: done.map(a => ({
                        annotatorId: a.annotatorId || '',
                        annotatorName: userMap[a.annotatorId] || a.annotatorId || 'Unknown',
                        value: String(a.value),
                    })),
                    isLowAgreement: agreementScore < threshold,
                });
            }

            // Sort worst first
            items.sort((a, b) => a.agreementScore - b.agreementScore);

            const overallScore = itemsWithEnoughAnnotations > 0
                ? Math.round((totalScoreSum / itemsWithEnoughAnnotations) * 1000) / 1000
                : null;

            res.json({
                projectId,
                threshold,
                overallScore,
                totalIAAItems: rows.length,
                itemsWithEnoughAnnotations,
                lowAgreementCount: items.filter(i => i.isLowAgreement).length,
                items,
            });
        } catch (err) {
            console.error('GET /api/projects/:id/iaa error:', err);
            res.status(500).json({ error: 'Failed to compute IAA stats' });
        }
    });
}
