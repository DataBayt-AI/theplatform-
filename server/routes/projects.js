import { getDatabase } from '../services/database.js';
import crypto from 'crypto';

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
                    customFieldName: p.custom_field_name,
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

    // Get paginated data points (Moved here to avoid route conflicts)
    app.get('/api/projects/:id/data', (req, res) => {
        try {
            const { id } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;

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
            const dataPoints = db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at LIMIT ? OFFSET ?').all(id, limit, offset);

            const totalPages = Math.ceil(total / limit);

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
                    createdAt: dp.created_at,
                    updatedAt: dp.updated_at
                })),
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages
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
                    details: log.details ? JSON.parse(log.details) : null,
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
            const { name, description, managerId, annotatorIds = [], xmlConfig, uploadPrompt, customFieldName } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Project name is required' });
            }

            const id = crypto.randomUUID();
            const now = Date.now();

            db.prepare(`
        INSERT INTO projects (id, name, description, manager_id, xml_config, upload_prompt, custom_field_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, name, description || null, managerId || null, xmlConfig || null, uploadPrompt || null, customFieldName || null, now, now);

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
            const { name, description, managerId, annotatorIds, xmlConfig, uploadPrompt, customFieldName, dataPoints, stats } = req.body;

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
          updated_at = ?
        WHERE id = ?
      `).run(name, description, managerId, xmlConfig, uploadPrompt, customFieldName, now, id);

            // Update annotators if provided
            if (annotatorIds !== undefined) {
                db.prepare('DELETE FROM project_annotators WHERE project_id = ?').run(id);
                const insertAnnotator = db.prepare('INSERT INTO project_annotators (project_id, user_id) VALUES (?, ?)');
                for (const userId of annotatorIds) {
                    try {
                        insertAnnotator.run(id, userId);
                    } catch (e) {
                        // Ignore
                    }
                }
            }

            // Update data points if provided
            if (dataPoints && Array.isArray(dataPoints)) {
                const upsertDataPoint = db.prepare(`
          INSERT INTO data_points (
            id, project_id, content, type, original_annotation, human_annotation, final_annotation,
            ai_suggestions, ratings, status, confidence, upload_prompt, custom_field, custom_field_name,
            custom_field_values, metadata, display_metadata, split, annotator_id, annotator_name,
            annotated_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    // Delete project
    app.delete('/api/projects/:id', (req, res) => {
        try {
            const { id } = req.params;
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

    app.delete('/api/projects/:id/snapshots/:snapshotId', (req, res) => {
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
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 50;
            const offset = (page - 1) * limit;

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
            const dataPoints = db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at LIMIT ? OFFSET ?').all(projectId, limit, offset);

            const totalPages = Math.ceil(total / limit);

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
                    createdAt: dp.created_at,
                    updatedAt: dp.updated_at
                })),
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages
                }
            });

        } catch (error) {
            console.error('Error fetching data points:', error);
            res.status(500).json({ error: 'Failed to fetch data points' });
        }
    });

}

export default { registerProjectRoutes };
