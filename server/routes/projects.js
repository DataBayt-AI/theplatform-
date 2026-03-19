import { getDatabase } from '../services/database.js';
import crypto from 'crypto';
import { createNotifications } from '../services/notificationService.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

/**
 * Projects API routes
 */
export function registerProjectRoutes(app) {
    const db = getDatabase();

    // Get all projects (filtered by user access)
    app.get('/api/projects', (req, res) => {
        try {
            const user = req.user;
            let projects;

            if (!user) {
                // No user - return empty for unauthenticated requests
                projects = [];
            } else if (user.roles?.includes('admin')) {
                // Admin sees all projects
                projects = db.prepare(`
          SELECT p.*, 
                 (SELECT COUNT(*) FROM data_points WHERE project_id = p.id) as data_count
          FROM projects p
          ORDER BY p.updated_at DESC
        `).all();
            } else if (user.roles?.includes('manager')) {
                // Manager sees projects they manage or are assigned to
                projects = db.prepare(`
          SELECT DISTINCT p.*, 
                 (SELECT COUNT(*) FROM data_points WHERE project_id = p.id) as data_count
          FROM projects p
          LEFT JOIN project_annotators pa ON p.id = pa.project_id
          WHERE p.manager_id = ? OR pa.user_id = ?
          ORDER BY p.updated_at DESC
        `).all(user.id, user.id);
            } else {
                // Annotator sees only assigned projects
                projects = db.prepare(`
          SELECT p.*, 
                 (SELECT COUNT(*) FROM data_points WHERE project_id = p.id) as data_count
          FROM projects p
          INNER JOIN project_annotators pa ON p.id = pa.project_id
          WHERE pa.user_id = ?
          ORDER BY p.updated_at DESC
        `).all(user.id);
            }

            // Get annotator IDs for each project
            const annotatorStmt = db.prepare('SELECT user_id FROM project_annotators WHERE project_id = ?');

            const enrichedProjects = projects.map(p => {
                const annotators = annotatorStmt.all(p.id).map(a => a.user_id);
                const stats = db.prepare('SELECT * FROM project_stats WHERE project_id = ?').get(p.id) || {};

                return {
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    managerId: p.manager_id,
                    annotatorIds: annotators,
                    xmlConfig: p.xml_config,
                    uploadPrompt: p.upload_prompt,
                    customFieldName: p.custom_field_name,
                    guidelines: p.guidelines ?? '',
                    isDemo: !!p.is_demo,
                    dataPoints: [], // Don't send full data points in list view
                    totalDataPoints: p.data_count,
                    createdAt: p.created_at,
                    updatedAt: p.updated_at,
                    stats: {
                        totalAccepted: stats.total_accepted || 0,
                        totalRejected: stats.total_rejected || 0,
                        totalEdited: stats.total_edited || 0,
                        totalProcessed: stats.total_processed || 0,
                        averageConfidence: stats.average_confidence || 0,
                        sessionTime: stats.session_time || 0
                    }
                };
            });

            res.json(enrichedProjects);
        } catch (error) {
            console.error('Error fetching projects:', error);
            res.status(500).json({ error: 'Failed to fetch projects' });
        }
    });

    // Get per-annotator quality stats for a project (admin/manager only)
    app.get('/api/projects/:id/annotator-stats', (req, res) => {
        const user = req.user;
        if (!user || (!user.roles?.includes('admin') && !user.roles?.includes('manager'))) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const { id } = req.params;
        try {
            const rows = db.prepare(`
                SELECT
                    annotator_id,
                    MAX(annotator_name) AS annotator_name,
                    COUNT(*)            AS total_annotated,
                    MIN(annotated_at)   AS first_at,
                    MAX(annotated_at)   AS last_at,
                    SUM(CASE WHEN status = 'edited'   THEN 1 ELSE 0 END) AS edited_count,
                    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
                FROM data_points
                WHERE project_id = ?
                  AND annotator_id IS NOT NULL
                  AND annotated_at IS NOT NULL
                GROUP BY annotator_id
                HAVING COUNT(*) > 0
                ORDER BY total_annotated DESC
            `).all(id);

            // Compute IAA agreement rate from assignments column
            const iaaRows = db.prepare(`
                SELECT assignments FROM data_points
                WHERE project_id = ? AND is_iaa = 1
                  AND assignments IS NOT NULL AND assignments != '[]'
            `).all(id);

            const iaaStats = {}; // annotatorId -> { matched, total }
            for (const row of iaaRows) {
                const assignments = JSON.parse(row.assignments || '[]');
                const done = assignments.filter(a => a.status === 'done' && a.value != null);
                if (done.length < 2) continue;
                // majority label
                const freq = {};
                for (const a of done) freq[a.value] = (freq[a.value] || 0) + 1;
                const majority = Object.entries(freq).sort((x, y) => y[1] - x[1])[0][0];
                for (const a of done) {
                    if (!iaaStats[a.annotatorId]) iaaStats[a.annotatorId] = { matched: 0, total: 0 };
                    iaaStats[a.annotatorId].total++;
                    if (a.value === majority) iaaStats[a.annotatorId].matched++;
                }
            }

            const annotators = rows.map(r => {
                const span = (r.last_at - r.first_at) / 3_600_000;
                const speedPerHour = span > 0 ? r.total_annotated / span : r.total_annotated;
                const iaa = iaaStats[r.annotator_id];
                const agreementRate = iaa && iaa.total > 0
                    ? Math.round((iaa.matched / iaa.total) * 1000) / 1000
                    : null;
                return {
                    annotatorId: r.annotator_id,
                    annotatorName: r.annotator_name,
                    totalAnnotated: r.total_annotated,
                    speedPerHour: Math.round(speedPerHour * 10) / 10,
                    editRate: r.edited_count / r.total_annotated,
                    rejectionRate: r.rejected_count / r.total_annotated,
                    agreementRate,
                    firstAnnotatedAt: r.first_at,
                    lastAnnotatedAt: r.last_at,
                };
            });

            const n = annotators.length;
            const withAgreement = annotators.filter(a => a.agreementRate !== null);
            const summary = {
                totalAnnotators: n,
                avgSpeedPerHour: n ? Math.round(annotators.reduce((s, a) => s + a.speedPerHour, 0) / n * 10) / 10 : 0,
                avgEditRate: n ? annotators.reduce((s, a) => s + a.editRate, 0) / n : 0,
                avgRejectionRate: n ? annotators.reduce((s, a) => s + a.rejectionRate, 0) / n : 0,
                avgAgreementRate: withAgreement.length
                    ? withAgreement.reduce((s, a) => s + a.agreementRate, 0) / withAgreement.length
                    : null,
            };

            res.json({ projectId: id, annotators, summary });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // Get paginated data points (Moved here to avoid route conflicts)
    app.get('/api/projects/:id/data', (req, res) => {
        try {
            const { id } = req.params;
            const parsedPage = parseInt(req.query.page, 10);
            const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
            const parsedLimit = parseInt(req.query.limit, 10);
            const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
            const offset = limit ? (page - 1) * limit : 0;

            // Validate project exists and user has access
            const project = db.prepare('SELECT manager_id FROM projects WHERE id = ?').get(id);
            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }

            const user = req.user;
            if (user && !user.roles?.includes('admin')) {
                const isManager = project.manager_id === user.id;
                const isAnnotator = db.prepare(
                    'SELECT 1 FROM project_annotators WHERE project_id = ? AND user_id = ?'
                ).get(id, user.id);

                if (!isManager && !isAnnotator) {
                    return res.status(403).json({ error: 'Access denied' });
                }
            }

            const total = db.prepare('SELECT COUNT(*) as count FROM data_points WHERE project_id = ?').get(id).count;
            const statusCounts = db.prepare(`
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
                    SUM(CASE WHEN status = 'edited' THEN 1 ELSE 0 END) as edited,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'ai_processed' THEN 1 ELSE 0 END) as aiProcessed,
                    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
                FROM data_points
                WHERE project_id = ?
            `).get(id);
            const dataPoints = limit
                ? db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at LIMIT ? OFFSET ?').all(id, limit, offset)
                : db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at').all(id);

            const totalPages = limit ? Math.max(1, Math.ceil(total / limit)) : 1;

            res.json({
                dataPoints: dataPoints.map(dp => ({
                    id: dp.id,
                    content: dp.content,
                    type: dp.type,
                    originalAnnotation: dp.original_annotation,
                    humanAnnotation: dp.human_annotation,
                    finalAnnotation: dp.final_annotation,
                    aiSuggestions: JSON.parse(dp.ai_suggestions || '{}'),
                    ratings: JSON.parse(dp.ratings || '{}'),
                    status: dp.status,
                    confidence: dp.confidence,
                    uploadPrompt: dp.upload_prompt,
                    customField: dp.custom_field,
                    customFieldName: dp.custom_field_name,
                    customFieldValues: JSON.parse(dp.custom_field_values || '{}'),
                    metadata: JSON.parse(dp.metadata || '{}'),
                    displayMetadata: JSON.parse(dp.display_metadata || '{}'),
                    split: dp.split,
                    annotatorId: dp.annotator_id,
                    annotatorName: dp.annotator_name,
                    annotatedAt: dp.annotated_at,
                    isIAA: !!dp.is_iaa,
                    assignments: JSON.parse(dp.assignments || '[]'),
                    createdAt: dp.created_at,
                    updatedAt: dp.updated_at
                })),
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages
                },
                statusCounts: {
                    total: statusCounts.total || 0,
                    completed: (statusCounts.accepted || 0) + (statusCounts.edited || 0),
                    remaining: Math.max(0, (statusCounts.total || 0) - ((statusCounts.accepted || 0) + (statusCounts.edited || 0))),
                    accepted: statusCounts.accepted || 0,
                    edited: statusCounts.edited || 0,
                    pending: statusCounts.pending || 0,
                    aiProcessed: statusCounts.aiProcessed || 0,
                    rejected: statusCounts.rejected || 0
                }
            });

        } catch (error) {
            console.error('Error fetching data points:', error);
            res.status(500).json({ error: 'Failed to fetch data points' });
        }
    });

    // Get single project with data points
    app.get('/api/projects/:id', (req, res) => {
        try {
            const { id } = req.params;
            const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);

            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }

            // Check access
            const user = req.user;
            if (user && !user.roles?.includes('admin')) {
                const isManager = project.manager_id === user.id;
                const isAnnotator = db.prepare(
                    'SELECT 1 FROM project_annotators WHERE project_id = ? AND user_id = ?'
                ).get(id, user.id);

                if (!isManager && !isAnnotator) {
                    return res.status(403).json({ error: 'Access denied' });
                }
            }

            // Get data points (OPTIONAL: now handled by pagination endpoint /data)
            // For backward compatibility or small projects, we could optionally return them,
            // but for performance default to empty.
            // If query param includeData=true is present, return all (warning: slow).
            const includeData = req.query.includeData === 'true';
            let dataPoints = [];
            if (includeData) {
                dataPoints = db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at').all(id);
            }

            // Get annotators
            const annotators = db.prepare('SELECT user_id FROM project_annotators WHERE project_id = ?').all(id);

            // Get stats
            const stats = db.prepare('SELECT * FROM project_stats WHERE project_id = ?').get(id) || {};

            // Get audit log
            const auditLog = db.prepare('SELECT * FROM audit_log WHERE project_id = ? ORDER BY timestamp DESC').all(id);

            const result = {
                id: project.id,
                name: project.name,
                description: project.description,
                managerId: project.manager_id,
                annotatorIds: annotators.map(a => a.user_id),
                xmlConfig: project.xml_config,
                uploadPrompt: project.upload_prompt,
                customFieldName: project.custom_field_name,
                guidelines: project.guidelines ?? '',
                iaaConfig: project.iaa_config ? JSON.parse(project.iaa_config) : null,
                createdAt: project.created_at,
                updatedAt: project.updated_at,
                dataPoints: dataPoints.map(dp => ({
                    id: dp.id,
                    content: dp.content,
                    type: dp.type,
                    originalAnnotation: dp.original_annotation,
                    humanAnnotation: dp.human_annotation,
                    finalAnnotation: dp.final_annotation,
                    aiSuggestions: JSON.parse(dp.ai_suggestions || '{}'),
                    ratings: JSON.parse(dp.ratings || '{}'),
                    status: dp.status,
                    confidence: dp.confidence,
                    uploadPrompt: dp.upload_prompt,
                    customField: dp.custom_field,
                    customFieldName: dp.custom_field_name,
                    customFieldValues: JSON.parse(dp.custom_field_values || '{}'),
                    metadata: JSON.parse(dp.metadata || '{}'),
                    displayMetadata: JSON.parse(dp.display_metadata || '{}'),
                    split: dp.split,
                    annotatorId: dp.annotator_id,
                    annotatorName: dp.annotator_name,
                    annotatedAt: dp.annotated_at,
                    isIAA: !!dp.is_iaa,
                    assignments: JSON.parse(dp.assignments || '[]'),
                    createdAt: dp.created_at,
                    updatedAt: dp.updated_at
                })),
                stats: {
                    totalAccepted: stats.total_accepted || 0,
                    totalRejected: stats.total_rejected || 0,
                    totalEdited: stats.total_edited || 0,
                    totalProcessed: stats.total_processed || 0,
                    averageConfidence: stats.average_confidence || 0,
                    sessionTime: stats.session_time || 0
                },
                auditLog: auditLog.map(log => ({
                    id: log.id,
                    actorId: log.actor_id,
                    actorName: log.actor_name,
                    action: log.action,
                    details: log.details ? (() => { try { return JSON.parse(log.details); } catch { return log.details; } })() : null,
                    timestamp: log.timestamp
                }))
            };

            res.json(result);
        } catch (error) {
            console.error('Error fetching project:', error);
            res.status(500).json({ error: 'Failed to fetch project' });
        }
    });

    // Create project
    app.post('/api/projects', (req, res) => {
        try {
            const { name, description, managerId, annotatorIds = [], xmlConfig, uploadPrompt, customFieldName, guidelines } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Project name is required' });
            }

            const id = crypto.randomUUID();
            const now = Date.now();

            db.prepare(`
        INSERT INTO projects (id, name, description, manager_id, xml_config, upload_prompt, custom_field_name, guidelines, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, description || null, managerId || null, xmlConfig || null, uploadPrompt || null, customFieldName || null, guidelines || null, now, now);

            // Add annotators
            const insertAnnotator = db.prepare('INSERT INTO project_annotators (project_id, user_id) VALUES (?, ?)');
            for (const userId of annotatorIds) {
                try {
                    insertAnnotator.run(id, userId);
                } catch (e) {
                    // Ignore duplicate or invalid user
                }
            }

            // Initialize stats
            db.prepare('INSERT INTO project_stats (project_id) VALUES (?)').run(id);

            // Notify assigned annotators
            if (annotatorIds.length > 0) {
                createNotifications(annotatorIds, {
                    type: 'assignment',
                    title: 'You were assigned to a project',
                    body: `You have been added as an annotator on "${name}"`,
                    data: { projectId: id },
                });
            }

            res.status(201).json({
                id,
                name,
                description,
                managerId,
                annotatorIds,
                createdAt: now,
                updatedAt: now
            });
        } catch (error) {
            console.error('Error creating project:', error);
            res.status(500).json({ error: 'Failed to create project' });
        }
    });

    // Update project
    app.put('/api/projects/:id', (req, res) => {
        handleUpdateProject(req, res);
    });

    app.patch('/api/projects/:id', (req, res) => {
        handleUpdateProject(req, res);
    });

    function handleUpdateProject(req, res) {
        try {
            const { id } = req.params;
            const { name, description, managerId, annotatorIds, xmlConfig, uploadPrompt, customFieldName, guidelines, iaaConfig, dataPoints, stats } = req.body;

            const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
            if (!existing) {
                return res.status(404).json({ error: 'Project not found' });
            }

            const now = Date.now();

            // Update project fields
            db.prepare(`
        UPDATE projects SET
          name = COALESCE(?, name),
          description = COALESCE(?, description),
          manager_id = COALESCE(?, manager_id),
          xml_config = COALESCE(?, xml_config),
          upload_prompt = COALESCE(?, upload_prompt),
          custom_field_name = COALESCE(?, custom_field_name),
          guidelines = COALESCE(?, guidelines),
          iaa_config = COALESCE(?, iaa_config),
          updated_at = ?
        WHERE id = ?
      `).run(name, description, managerId, xmlConfig, uploadPrompt, customFieldName, guidelines ?? null, iaaConfig ? JSON.stringify(iaaConfig) : null, now, id);

            // Update annotators if provided
            if (annotatorIds !== undefined) {
                const previousIds = db.prepare(
                    'SELECT user_id FROM project_annotators WHERE project_id = ?'
                ).all(id).map(r => r.user_id);
                const previousSet = new Set(previousIds);

                db.prepare('DELETE FROM project_annotators WHERE project_id = ?').run(id);
                const insertAnnotator = db.prepare('INSERT INTO project_annotators (project_id, user_id) VALUES (?, ?)');
                for (const userId of annotatorIds) {
                    try {
                        insertAnnotator.run(id, userId);
                    } catch (e) {
                        // Ignore
                    }
                }

                // Notify only newly added annotators
                const newlyAdded = annotatorIds.filter(uid => !previousSet.has(uid));
                if (newlyAdded.length > 0) {
                    const projectName = name || existing.name;
                    createNotifications(newlyAdded, {
                        type: 'assignment',
                        title: 'You were assigned to a project',
                        body: `You have been added as an annotator on "${projectName}"`,
                        data: { projectId: id },
                    });
                }
            }

            // Update data points if provided
            if (dataPoints && Array.isArray(dataPoints)) {
                const upsertDataPoint = db.prepare(`
          INSERT INTO data_points (
            id, project_id, content, type, original_annotation, human_annotation, final_annotation,
            ai_suggestions, ratings, status, confidence, upload_prompt, custom_field, custom_field_name,
            custom_field_values, metadata, display_metadata, split, annotator_id, annotator_name,
            annotated_at, is_iaa, assignments, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            project_id = excluded.project_id,
            content = excluded.content,
            type = excluded.type,
            original_annotation = excluded.original_annotation,
            human_annotation = excluded.human_annotation,
            final_annotation = excluded.final_annotation,
            ai_suggestions = excluded.ai_suggestions,
            ratings = excluded.ratings,
            status = excluded.status,
            confidence = excluded.confidence,
            upload_prompt = excluded.upload_prompt,
            custom_field = excluded.custom_field,
            custom_field_name = excluded.custom_field_name,
            custom_field_values = excluded.custom_field_values,
            metadata = excluded.metadata,
            display_metadata = excluded.display_metadata,
            split = excluded.split,
            annotator_id = excluded.annotator_id,
            annotator_name = excluded.annotator_name,
            annotated_at = excluded.annotated_at,
            is_iaa = excluded.is_iaa,
            assignments = excluded.assignments,
            updated_at = excluded.updated_at
        `);

                for (const dp of dataPoints) {
                    upsertDataPoint.run(
                        dp.id,
                        id,
                        dp.content,
                        dp.type || 'text',
                        dp.originalAnnotation || null,
                        dp.humanAnnotation || null,
                        dp.finalAnnotation || null,
                        JSON.stringify(dp.aiSuggestions || {}),
                        JSON.stringify(dp.ratings || {}),
                        dp.status || 'pending',
                        dp.confidence || null,
                        dp.uploadPrompt || null,
                        dp.customField || null,
                        dp.customFieldName || null,
                        JSON.stringify(dp.customFieldValues || {}),
                        JSON.stringify(dp.metadata || {}),
                        JSON.stringify(dp.displayMetadata || {}),
                        dp.split || null,
                        dp.annotatorId || null,
                        dp.annotatorName || null,
                        dp.annotatedAt || null,
                        dp.isIAA ? 1 : 0,
                        JSON.stringify(dp.assignments || []),
                        dp.createdAt || now,
                        now
                    );
                }
            }

            // Update stats if provided
            if (stats) {
                db.prepare(`
          INSERT INTO project_stats (project_id, total_accepted, total_rejected, total_edited, total_processed, average_confidence, session_time)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(project_id) DO UPDATE SET
            total_accepted = excluded.total_accepted,
            total_rejected = excluded.total_rejected,
            total_edited = excluded.total_edited,
            total_processed = excluded.total_processed,
            average_confidence = excluded.average_confidence,
            session_time = excluded.session_time
        `).run(
                    id,
                    stats.totalAccepted || 0,
                    stats.totalRejected || 0,
                    stats.totalEdited || 0,
                    stats.totalProcessed || 0,
                    stats.averageConfidence || 0,
                    stats.sessionTime || 0
                );
            }

            res.json({ success: true, updatedAt: now });
        } catch (error) {
            console.error('Error updating project:', error);
            res.status(500).json({ error: 'Failed to update project' });
        }
    }

    // Delete project (admin or project manager only)
    app.delete('/api/projects/:id', requireAuth, (req, res) => {
        try {
            const { id } = req.params;
            const user = req.user;

            // Only admins or the project manager can delete
            const project = db.prepare('SELECT manager_id FROM projects WHERE id = ?').get(id);
            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }

            const isAdmin = user.roles.includes('admin');
            const isManager = user.roles.includes('manager') && project.manager_id === user.id;

            if (!isAdmin && !isManager) {
                return res.status(403).json({ error: 'Forbidden' });
            }

            const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);

            if (result.changes === 0) {
                return res.status(404).json({ error: 'Project not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting project:', error);
            res.status(500).json({ error: 'Failed to delete project' });
        }
    });

    // Add audit log entry
    app.post('/api/projects/:id/audit', (req, res) => {
        try {
            const { id } = req.params;
            const { action, details } = req.body;
            const user = req.user;

            const logId = crypto.randomUUID();
            const now = Date.now();

            db.prepare(`
        INSERT INTO audit_log (id, project_id, actor_id, actor_name, action, details, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(logId, id, user?.id || null, user?.username || 'Unknown', action, JSON.stringify(details || null), now);

            res.status(201).json({ id: logId, timestamp: now });
        } catch (error) {
            console.error('Error adding audit log:', error);
            res.status(500).json({ error: 'Failed to add audit log' });
        }
    });

    // Snapshots routes
    app.get('/api/projects/:id/snapshots', (req, res) => {
        try {
            const { id } = req.params;
            const snapshots = db.prepare('SELECT * FROM snapshots WHERE project_id = ? ORDER BY created_at DESC').all(id);

            res.json(snapshots.map(s => ({
                id: s.id,
                projectId: s.project_id,
                name: s.name,
                description: s.description,
                dataPoints: JSON.parse(s.data_points),
                stats: JSON.parse(s.stats),
                createdAt: s.created_at
            })));
        } catch (error) {
            console.error('Error fetching snapshots:', error);
            res.status(500).json({ error: 'Failed to fetch snapshots' });
        }
    });

    app.post('/api/projects/:id/snapshots', (req, res) => {
        try {
            const { id } = req.params;
            const { name, description, dataPoints, stats } = req.body;

            const snapshotId = crypto.randomUUID();
            const now = Date.now();

            db.prepare(`
        INSERT INTO snapshots (id, project_id, name, description, data_points, stats, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(snapshotId, id, name, description || null, JSON.stringify(dataPoints), JSON.stringify(stats), now);

            res.status(201).json({ id: snapshotId, createdAt: now });
        } catch (error) {
            console.error('Error creating snapshot:', error);
            res.status(500).json({ error: 'Failed to create snapshot' });
        }
    });

    app.delete('/api/projects/:id/snapshots/:snapshotId', requireAuth, requireRole(['admin', 'manager']), (req, res) => {
        try {
            const { snapshotId } = req.params;
            db.prepare('DELETE FROM snapshots WHERE id = ?').run(snapshotId);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting snapshot:', error);
            res.status(500).json({ error: 'Failed to delete snapshot' });
        }
    });
    // Update single data point (granular update)
    app.patch('/api/projects/:projectId/data/:dataId', (req, res) => {
        try {
            const { projectId, dataId } = req.params;
            const updates = req.body;
            const now = Date.now();

            // Validate project exists
            const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }

            // Verify data point exists and belongs to project
            const dataPoint = db.prepare('SELECT * FROM data_points WHERE id = ? AND project_id = ?').get(dataId, projectId);
            if (!dataPoint) {
                return res.status(404).json({ error: 'Data point not found in this project' });
            }

            // Allowed fields to update
            const allowedFields = [
                'content', 'human_annotation', 'final_annotation', 'status',
                'ai_suggestions', 'ratings', 'custom_field_values',
                'annotator_id', 'annotator_name', 'annotated_at'
            ];

            const setClause = [];
            const values = [];

            for (const [key, value] of Object.entries(updates)) {
                // Map camelCase to snake_case for DB
                let dbKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();

                // Allow specific mappings if needed (e.g. if frontend sends camelCase)
                if (key === 'originalAnnotation') dbKey = 'original_annotation';
                if (key === 'humanAnnotation') dbKey = 'human_annotation';
                if (key === 'finalAnnotation') dbKey = 'final_annotation';
                if (key === 'aiSuggestions') dbKey = 'ai_suggestions';
                if (key === 'customFieldValues') dbKey = 'custom_field_values';
                if (key === 'annotatorId') dbKey = 'annotator_id';
                if (key === 'annotatorName') dbKey = 'annotator_name';
                if (key === 'annotatedAt') dbKey = 'annotated_at';

                if (allowedFields.includes(dbKey)) {
                    setClause.push(`${dbKey} = ?`);
                    if (typeof value === 'object' && value !== null) {
                        values.push(JSON.stringify(value));
                    } else {
                        values.push(value);
                    }
                }
            }

            if (setClause.length === 0) {
                return res.status(400).json({ error: 'No valid fields to update' });
            }

            setClause.push('updated_at = ?');
            values.push(now);
            values.push(dataId);
            values.push(projectId);

            db.prepare(`UPDATE data_points SET ${setClause.join(', ')} WHERE id = ? AND project_id = ?`).run(...values);

            // Recalculate stats for the project
            // We could do this incrementally, but a full recalc is safer for now
            const stats = db.prepare(`
                SELECT
                    COUNT(CASE WHEN status = 'accepted' THEN 1 END) as totalAccepted,
                    COUNT(CASE WHEN status = 'pending' AND LENGTH(ai_suggestions) > 2 THEN 1 END) as totalRejected,
                    COUNT(CASE WHEN status = 'edited' THEN 1 END) as totalEdited,
                    COUNT(CASE WHEN status = 'ai_processed' THEN 1 END) as totalProcessed,
                    AVG(CASE WHEN confidence > 0 THEN confidence END) as averageConfidence
                FROM data_points
                WHERE project_id = ?
            `).get(projectId);

            db.prepare(`
                INSERT INTO project_stats (project_id, total_accepted, total_rejected, total_edited, total_processed, average_confidence)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id) DO UPDATE SET
                    total_accepted = excluded.total_accepted,
                    total_rejected = excluded.total_rejected,
                    total_edited = excluded.total_edited,
                    total_processed = excluded.total_processed,
                    average_confidence = excluded.average_confidence
            `).run(
                projectId,
                stats.totalAccepted || 0,
                stats.totalRejected || 0,
                stats.totalEdited || 0,
                stats.totalProcessed || 0,
                stats.averageConfidence || 0
            );

            res.json({ success: true, updatedAt: now });

        } catch (error) {
            console.error('Error updating data point:', error);
            res.status(500).json({ error: 'Failed to update data point' });
        }
    });

    // Get paginated data points
    app.get('/api/projects/:projectId/data', (req, res) => {
        try {
            const { projectId } = req.params;
            const parsedPage = parseInt(req.query.page, 10);
            const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
            const parsedLimit = parseInt(req.query.limit, 10);
            const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
            const offset = limit ? (page - 1) * limit : 0;

            // Validate project exists and user has access (reusing logic from getById ideally, but simple check here)
            const project = db.prepare('SELECT manager_id FROM projects WHERE id = ?').get(projectId);
            if (!project) {
                return res.status(404).json({ error: 'Project not found' });
            }

            // Check access (simplified for now, ideally strictly check project_annotators too if not manager)
            const user = req.user;
            if (user && !user.roles?.includes('admin')) {
                const isManager = project.manager_id === user.id;
                const isAnnotator = db.prepare(
                    'SELECT 1 FROM project_annotators WHERE project_id = ? AND user_id = ?'
                ).get(projectId, user.id);

                if (!isManager && !isAnnotator) {
                    return res.status(403).json({ error: 'Access denied' });
                }
            }

            const total = db.prepare('SELECT COUNT(*) as count FROM data_points WHERE project_id = ?').get(projectId).count;
            const statusCounts = db.prepare(`
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
                    SUM(CASE WHEN status = 'edited' THEN 1 ELSE 0 END) as edited,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'ai_processed' THEN 1 ELSE 0 END) as aiProcessed,
                    SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
                FROM data_points
                WHERE project_id = ?
            `).get(projectId);
            const dataPoints = limit
                ? db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at LIMIT ? OFFSET ?').all(projectId, limit, offset)
                : db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at').all(projectId);

            const totalPages = limit ? Math.max(1, Math.ceil(total / limit)) : 1;

            res.json({
                dataPoints: dataPoints.map(dp => ({
                    id: dp.id,
                    content: dp.content,
                    type: dp.type,
                    originalAnnotation: dp.original_annotation,
                    humanAnnotation: dp.human_annotation,
                    finalAnnotation: dp.final_annotation,
                    aiSuggestions: JSON.parse(dp.ai_suggestions || '{}'),
                    ratings: JSON.parse(dp.ratings || '{}'),
                    status: dp.status,
                    confidence: dp.confidence,
                    uploadPrompt: dp.upload_prompt,
                    customField: dp.custom_field,
                    customFieldName: dp.custom_field_name,
                    customFieldValues: JSON.parse(dp.custom_field_values || '{}'),
                    metadata: JSON.parse(dp.metadata || '{}'),
                    displayMetadata: JSON.parse(dp.display_metadata || '{}'),
                    split: dp.split,
                    annotatorId: dp.annotator_id,
                    annotatorName: dp.annotator_name,
                    annotatedAt: dp.annotated_at,
                    isIAA: !!dp.is_iaa,
                    assignments: JSON.parse(dp.assignments || '[]'),
                    createdAt: dp.created_at,
                    updatedAt: dp.updated_at
                })),
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages
                },
                statusCounts: {
                    total: statusCounts.total || 0,
                    completed: (statusCounts.accepted || 0) + (statusCounts.edited || 0),
                    remaining: Math.max(0, (statusCounts.total || 0) - ((statusCounts.accepted || 0) + (statusCounts.edited || 0))),
                    accepted: statusCounts.accepted || 0,
                    edited: statusCounts.edited || 0,
                    pending: statusCounts.pending || 0,
                    aiProcessed: statusCounts.aiProcessed || 0,
                    rejected: statusCounts.rejected || 0
                }
            });

        } catch (error) {
            console.error('Error fetching data points:', error);
            res.status(500).json({ error: 'Failed to fetch data points' });
        }
    });

}

export default { registerProjectRoutes };
