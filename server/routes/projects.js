import { getDatabase } from '../services/database.js';
import crypto from 'crypto';
import { createNotifications } from '../services/notificationService.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { HttpError } from '../middleware/errors.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Maps a raw DB data_point row to the API response shape. */
function formatDataPoint(dp) {
    return {
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
    };
}

/** Returns pagination query params normalised to sane defaults. */
function parsePagination(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = parseInt(query.limit, 10);
    return {
        page,
        limit: Number.isFinite(limit) && limit > 0 ? limit : null,
        get offset() { return this.limit ? (this.page - 1) * this.limit : 0; }
    };
}

/** Throws 403 if the user has no access to the project. */
function assertProjectAccess(user, projectId, db) {
    if (user.roles?.includes('admin')) return;
    const isManager = db.prepare('SELECT 1 FROM projects WHERE id = ? AND manager_id = ?').get(projectId, user.id);
    const isAnnotator = db.prepare('SELECT 1 FROM project_annotators WHERE project_id = ? AND user_id = ?').get(projectId, user.id);
    if (!isManager && !isAnnotator) throw new HttpError(403, 'Access denied');
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function registerProjectRoutes(app) {
    const db = getDatabase();

    // Get all projects (filtered by role)
    app.get('/api/projects', requireAuth, asyncHandler((req, res) => {
        const { user } = req;
        let projects;

        if (user.roles?.includes('admin')) {
            projects = db.prepare(`
                SELECT p.*, (SELECT COUNT(*) FROM data_points WHERE project_id = p.id) as data_count
                FROM projects p ORDER BY p.updated_at DESC
            `).all();
        } else if (user.roles?.includes('manager')) {
            projects = db.prepare(`
                SELECT DISTINCT p.*, (SELECT COUNT(*) FROM data_points WHERE project_id = p.id) as data_count
                FROM projects p
                LEFT JOIN project_annotators pa ON p.id = pa.project_id
                WHERE p.manager_id = ? OR pa.user_id = ?
                ORDER BY p.updated_at DESC
            `).all(user.id, user.id);
        } else {
            projects = db.prepare(`
                SELECT p.*, (SELECT COUNT(*) FROM data_points WHERE project_id = p.id) as data_count
                FROM projects p
                INNER JOIN project_annotators pa ON p.id = pa.project_id
                WHERE pa.user_id = ? ORDER BY p.updated_at DESC
            `).all(user.id);
        }

        // Batch-load all annotators in one query to avoid N+1
        const projectIds = projects.map(p => p.id);
        const allAnnotators = projectIds.length
            ? db.prepare(
                `SELECT project_id, user_id FROM project_annotators WHERE project_id IN (${projectIds.map(() => '?').join(',')})`
              ).all(...projectIds)
            : [];
        const annotatorMap = {};
        for (const row of allAnnotators) {
            (annotatorMap[row.project_id] ??= []).push(row.user_id);
        }

        const allStats = projectIds.length
            ? db.prepare(
                `SELECT * FROM project_stats WHERE project_id IN (${projectIds.map(() => '?').join(',')})`
              ).all(...projectIds)
            : [];
        const statsMap = Object.fromEntries(allStats.map(s => [s.project_id, s]));

        res.json(projects.map(p => {
            const stats = statsMap[p.id] || {};
            return {
                id: p.id,
                name: p.name,
                description: p.description,
                managerId: p.manager_id,
                annotatorIds: annotatorMap[p.id] || [],
                taskType: p.task_type ?? 'custom',
                xmlConfig: p.xml_config,
                uploadPrompt: p.upload_prompt,
                customFieldName: p.custom_field_name,
                aiInstruction: p.ai_instruction ?? '',
                guidelines: p.guidelines ?? '',
                isDemo: !!p.is_demo,
                dataPoints: [],
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
        }));
    }));

    // Per-annotator quality stats (admin/manager only)
    app.get('/api/projects/:id/annotator-stats', requireRole(['admin', 'manager']), asyncHandler((req, res) => {
        const { id } = req.params;

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
            WHERE project_id = ? AND annotator_id IS NOT NULL AND annotated_at IS NOT NULL
            GROUP BY annotator_id HAVING COUNT(*) > 0
            ORDER BY total_annotated DESC
        `).all(id);

        const iaaRows = db.prepare(`
            SELECT assignments FROM data_points
            WHERE project_id = ? AND is_iaa = 1 AND assignments IS NOT NULL AND assignments != '[]'
        `).all(id);

        const iaaStats = {};
        for (const row of iaaRows) {
            const assignments = JSON.parse(row.assignments || '[]');
            const done = assignments.filter(a => a.status === 'done' && a.value != null);
            if (done.length < 2) continue;
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
            const iaa = iaaStats[r.annotator_id];
            return {
                annotatorId: r.annotator_id,
                annotatorName: r.annotator_name,
                totalAnnotated: r.total_annotated,
                speedPerHour: Math.round((span > 0 ? r.total_annotated / span : r.total_annotated) * 10) / 10,
                editRate: r.edited_count / r.total_annotated,
                rejectionRate: r.rejected_count / r.total_annotated,
                agreementRate: iaa && iaa.total > 0 ? Math.round((iaa.matched / iaa.total) * 1000) / 1000 : null,
                firstAnnotatedAt: r.first_at,
                lastAnnotatedAt: r.last_at,
            };
        });

        const n = annotators.length;
        const withAgreement = annotators.filter(a => a.agreementRate !== null);
        res.json({
            projectId: id,
            annotators,
            summary: {
                totalAnnotators: n,
                avgSpeedPerHour: n ? Math.round(annotators.reduce((s, a) => s + a.speedPerHour, 0) / n * 10) / 10 : 0,
                avgEditRate: n ? annotators.reduce((s, a) => s + a.editRate, 0) / n : 0,
                avgRejectionRate: n ? annotators.reduce((s, a) => s + a.rejectionRate, 0) / n : 0,
                avgAgreementRate: withAgreement.length
                    ? withAgreement.reduce((s, a) => s + a.agreementRate, 0) / withAgreement.length
                    : null,
            }
        });
    }));

    // Get paginated data points for a project
    app.get('/api/projects/:id/data', requireAuth, asyncHandler((req, res) => {
        const { id } = req.params;
        const project = db.prepare('SELECT manager_id FROM projects WHERE id = ?').get(id);
        if (!project) throw new HttpError(404, 'Project not found');
        assertProjectAccess(req.user, id, db);

        const { page, limit, offset } = parsePagination(req.query);
        const total = db.prepare('SELECT COUNT(*) as count FROM data_points WHERE project_id = ?').get(id).count;
        const statusCounts = db.prepare(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'accepted'     THEN 1 ELSE 0 END) as accepted,
                SUM(CASE WHEN status = 'edited'       THEN 1 ELSE 0 END) as edited,
                SUM(CASE WHEN status = 'pending'      THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'ai_processed' THEN 1 ELSE 0 END) as aiProcessed,
                SUM(CASE WHEN status = 'rejected'     THEN 1 ELSE 0 END) as rejected
            FROM data_points WHERE project_id = ?
        `).get(id);

        const dataPoints = limit
            ? db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at LIMIT ? OFFSET ?').all(id, limit, offset)
            : db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at').all(id);

        res.json({
            dataPoints: dataPoints.map(formatDataPoint),
            pagination: { total, page, limit, totalPages: limit ? Math.max(1, Math.ceil(total / limit)) : 1 },
            statusCounts: {
                total: statusCounts.total || 0,
                completed: (statusCounts.accepted || 0) + (statusCounts.edited || 0),
                remaining: Math.max(0, (statusCounts.total || 0) - (statusCounts.accepted || 0) - (statusCounts.edited || 0)),
                accepted: statusCounts.accepted || 0,
                edited: statusCounts.edited || 0,
                pending: statusCounts.pending || 0,
                aiProcessed: statusCounts.aiProcessed || 0,
                rejected: statusCounts.rejected || 0
            }
        });
    }));

    // Get single project
    app.get('/api/projects/:id', requireAuth, asyncHandler((req, res) => {
        const { id } = req.params;
        const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
        if (!project) throw new HttpError(404, 'Project not found');
        assertProjectAccess(req.user, id, db);

        const includeData = req.query.includeData === 'true';
        const dataPoints = includeData
            ? db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at').all(id)
            : [];

        const annotators = db.prepare('SELECT user_id FROM project_annotators WHERE project_id = ?').all(id);
        const stats = db.prepare('SELECT * FROM project_stats WHERE project_id = ?').get(id) || {};
        const auditLog = db.prepare('SELECT * FROM audit_log WHERE project_id = ? ORDER BY timestamp DESC').all(id);

        res.json({
            id: project.id,
            name: project.name,
            description: project.description,
            managerId: project.manager_id,
            annotatorIds: annotators.map(a => a.user_id),
            taskType: project.task_type ?? 'custom',
            xmlConfig: project.xml_config,
            uploadPrompt: project.upload_prompt,
            customFieldName: project.custom_field_name,
            aiInstruction: project.ai_instruction ?? '',
            guidelines: project.guidelines ?? '',
            iaaConfig: project.iaa_config ? JSON.parse(project.iaa_config) : null,
            createdAt: project.created_at,
            updatedAt: project.updated_at,
            dataPoints: dataPoints.map(formatDataPoint),
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
        });
    }));

    // Create project
    app.post('/api/projects', requireAuth, requireRole(['admin', 'manager']), asyncHandler((req, res) => {
        const { name, description, managerId, annotatorIds = [], taskType, xmlConfig, uploadPrompt, customFieldName, guidelines } = req.body;
        if (!name) throw new HttpError(400, 'Project name is required');

        const id = crypto.randomUUID();
        const now = Date.now();

        db.prepare(`
            INSERT INTO projects (id, name, description, manager_id, task_type, xml_config, upload_prompt, custom_field_name, guidelines, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, name, description || null, managerId || null, taskType || 'custom', xmlConfig || null, uploadPrompt || null, customFieldName || null, guidelines || null, now, now);

        const insertAnnotator = db.prepare('INSERT INTO project_annotators (project_id, user_id) VALUES (?, ?)');
        for (const userId of annotatorIds) {
            try { insertAnnotator.run(id, userId); } catch { /* ignore duplicate/invalid */ }
        }

        db.prepare('INSERT INTO project_stats (project_id) VALUES (?)').run(id);

        if (annotatorIds.length > 0) {
            createNotifications(annotatorIds, {
                type: 'assignment',
                title: 'You were assigned to a project',
                body: `You have been added as an annotator on "${name}"`,
                data: { projectId: id },
            });
        }

        res.status(201).json({ id, name, description, managerId, annotatorIds, createdAt: now, updatedAt: now });
    }));

    // Update project (PUT + PATCH share the same handler)
    const updateProject = asyncHandler((req, res) => {
        const { id } = req.params;
        const { name, description, managerId, annotatorIds, taskType, xmlConfig, uploadPrompt, customFieldName, guidelines, iaaConfig, aiInstruction, dataPoints, stats } = req.body;

        const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
        if (!existing) throw new HttpError(404, 'Project not found');

        const now = Date.now();

        db.prepare(`
            UPDATE projects SET
              name = COALESCE(?, name), description = COALESCE(?, description),
              manager_id = COALESCE(?, manager_id), task_type = COALESCE(?, task_type),
              xml_config = COALESCE(?, xml_config),
              upload_prompt = COALESCE(?, upload_prompt), custom_field_name = COALESCE(?, custom_field_name),
              guidelines = COALESCE(?, guidelines), iaa_config = COALESCE(?, iaa_config),
              ai_instruction = COALESCE(?, ai_instruction), updated_at = ?
            WHERE id = ?
        `).run(name, description, managerId, taskType ?? null, xmlConfig, uploadPrompt, customFieldName, guidelines ?? null, iaaConfig ? JSON.stringify(iaaConfig) : null, aiInstruction ?? null, now, id);

        if (annotatorIds !== undefined) {
            const previousIds = db.prepare('SELECT user_id FROM project_annotators WHERE project_id = ?').all(id).map(r => r.user_id);
            const previousSet = new Set(previousIds);

            db.prepare('DELETE FROM project_annotators WHERE project_id = ?').run(id);
            const insertAnnotator = db.prepare('INSERT INTO project_annotators (project_id, user_id) VALUES (?, ?)');
            for (const userId of annotatorIds) {
                try { insertAnnotator.run(id, userId); } catch { /* ignore */ }
            }

            const newlyAdded = annotatorIds.filter(uid => !previousSet.has(uid));
            if (newlyAdded.length > 0) {
                createNotifications(newlyAdded, {
                    type: 'assignment',
                    title: 'You were assigned to a project',
                    body: `You have been added as an annotator on "${name || existing.name}"`,
                    data: { projectId: id },
                });
            }
        }

        if (Array.isArray(dataPoints)) {
            const upsert = db.prepare(`
                INSERT INTO data_points (
                  id, project_id, content, type, original_annotation, human_annotation, final_annotation,
                  ai_suggestions, ratings, status, confidence, upload_prompt, custom_field, custom_field_name,
                  custom_field_values, metadata, display_metadata, split, annotator_id, annotator_name,
                  annotated_at, is_iaa, assignments, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  project_id=excluded.project_id, content=excluded.content, type=excluded.type,
                  original_annotation=excluded.original_annotation, human_annotation=excluded.human_annotation,
                  final_annotation=excluded.final_annotation, ai_suggestions=excluded.ai_suggestions,
                  ratings=excluded.ratings, status=excluded.status, confidence=excluded.confidence,
                  upload_prompt=excluded.upload_prompt, custom_field=excluded.custom_field,
                  custom_field_name=excluded.custom_field_name, custom_field_values=excluded.custom_field_values,
                  metadata=excluded.metadata, display_metadata=excluded.display_metadata, split=excluded.split,
                  annotator_id=excluded.annotator_id, annotator_name=excluded.annotator_name,
                  annotated_at=excluded.annotated_at, is_iaa=excluded.is_iaa,
                  assignments=excluded.assignments, updated_at=excluded.updated_at
            `);
            for (const dp of dataPoints) {
                upsert.run(
                    dp.id, id, dp.content, dp.type || 'text',
                    dp.originalAnnotation || null, dp.humanAnnotation || null, dp.finalAnnotation || null,
                    JSON.stringify(dp.aiSuggestions || {}), JSON.stringify(dp.ratings || {}),
                    dp.status || 'pending', dp.confidence || null, dp.uploadPrompt || null,
                    dp.customField || null, dp.customFieldName || null,
                    JSON.stringify(dp.customFieldValues || {}), JSON.stringify(dp.metadata || {}),
                    JSON.stringify(dp.displayMetadata || {}), dp.split || null,
                    dp.annotatorId || null, dp.annotatorName || null, dp.annotatedAt || null,
                    dp.isIAA ? 1 : 0, JSON.stringify(dp.assignments || []),
                    dp.createdAt || now, now
                );
            }
        }

        if (stats) {
            db.prepare(`
                INSERT INTO project_stats (project_id, total_accepted, total_rejected, total_edited, total_processed, average_confidence, session_time)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id) DO UPDATE SET
                  total_accepted=excluded.total_accepted, total_rejected=excluded.total_rejected,
                  total_edited=excluded.total_edited, total_processed=excluded.total_processed,
                  average_confidence=excluded.average_confidence, session_time=excluded.session_time
            `).run(id, stats.totalAccepted || 0, stats.totalRejected || 0, stats.totalEdited || 0,
                stats.totalProcessed || 0, stats.averageConfidence || 0, stats.sessionTime || 0);
        }

        res.json({ success: true, updatedAt: now });
    });

    app.put('/api/projects/:id', requireAuth, updateProject);
    app.patch('/api/projects/:id', requireAuth, updateProject);

    // Delete project (admin or project manager)
    app.delete('/api/projects/:id', requireAuth, asyncHandler((req, res) => {
        const { id } = req.params;
        const project = db.prepare('SELECT manager_id FROM projects WHERE id = ?').get(id);
        if (!project) throw new HttpError(404, 'Project not found');

        const { user } = req;
        const isAdmin = user.roles.includes('admin');
        const isManager = user.roles.includes('manager') && project.manager_id === user.id;
        if (!isAdmin && !isManager) throw new HttpError(403, 'Forbidden');

        db.prepare('DELETE FROM projects WHERE id = ?').run(id);
        res.json({ success: true });
    }));

    // Add audit log entry
    app.post('/api/projects/:id/audit', requireAuth, asyncHandler((req, res) => {
        const { id } = req.params;
        const { action, details } = req.body;
        const { user } = req;
        const logId = crypto.randomUUID();
        const now = Date.now();
        db.prepare(`
            INSERT INTO audit_log (id, project_id, actor_id, actor_name, action, details, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(logId, id, user?.id || null, user?.username || 'Unknown', action, JSON.stringify(details || null), now);
        res.status(201).json({ id: logId, timestamp: now });
    }));

    // Snapshots
    app.get('/api/projects/:id/snapshots', requireAuth, asyncHandler((req, res) => {
        const snapshots = db.prepare('SELECT * FROM snapshots WHERE project_id = ? ORDER BY created_at DESC').all(req.params.id);
        res.json(snapshots.map(s => ({
            id: s.id,
            projectId: s.project_id,
            name: s.name,
            description: s.description,
            dataPoints: JSON.parse(s.data_points),
            stats: JSON.parse(s.stats),
            createdAt: s.created_at
        })));
    }));

    app.post('/api/projects/:id/snapshots', requireAuth, asyncHandler((req, res) => {
        const { name, description, dataPoints, stats } = req.body;
        const snapshotId = crypto.randomUUID();
        const now = Date.now();
        db.prepare(`
            INSERT INTO snapshots (id, project_id, name, description, data_points, stats, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(snapshotId, req.params.id, name, description || null, JSON.stringify(dataPoints), JSON.stringify(stats), now);
        res.status(201).json({ id: snapshotId, createdAt: now });
    }));

    app.delete('/api/projects/:id/snapshots/:snapshotId', requireAuth, requireRole(['admin', 'manager']), asyncHandler((req, res) => {
        db.prepare('DELETE FROM snapshots WHERE id = ?').run(req.params.snapshotId);
        res.json({ success: true });
    }));

    // Update single data point
    app.patch('/api/projects/:projectId/data/:dataId', requireAuth, asyncHandler((req, res) => {
        const { projectId, dataId } = req.params;

        if (!db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) throw new HttpError(404, 'Project not found');
        if (!db.prepare('SELECT id FROM data_points WHERE id = ? AND project_id = ?').get(dataId, projectId)) throw new HttpError(404, 'Data point not found in this project');

        const ALLOWED = new Set([
            'content', 'human_annotation', 'final_annotation', 'status',
            'ai_suggestions', 'ratings', 'custom_field_values',
            'annotator_id', 'annotator_name', 'annotated_at'
        ]);
        const CAMEL_MAP = {
            originalAnnotation: 'original_annotation', humanAnnotation: 'human_annotation',
            finalAnnotation: 'final_annotation', aiSuggestions: 'ai_suggestions',
            customFieldValues: 'custom_field_values', annotatorId: 'annotator_id',
            annotatorName: 'annotator_name', annotatedAt: 'annotated_at'
        };

        const now = Date.now();
        const setClause = [];
        const values = [];

        for (const [key, value] of Object.entries(req.body)) {
            const dbKey = CAMEL_MAP[key] ?? key.replace(/([A-Z])/g, '_$1').toLowerCase();
            if (!ALLOWED.has(dbKey)) continue;
            setClause.push(`${dbKey} = ?`);
            values.push(typeof value === 'object' && value !== null ? JSON.stringify(value) : value);
        }

        if (setClause.length === 0) throw new HttpError(400, 'No valid fields to update');

        setClause.push('updated_at = ?');
        values.push(now, dataId, projectId);
        db.prepare(`UPDATE data_points SET ${setClause.join(', ')} WHERE id = ? AND project_id = ?`).run(...values);

        const stats = db.prepare(`
            SELECT
                COUNT(CASE WHEN status = 'accepted' THEN 1 END) as totalAccepted,
                COUNT(CASE WHEN status = 'pending' AND LENGTH(ai_suggestions) > 2 THEN 1 END) as totalRejected,
                COUNT(CASE WHEN status = 'edited' THEN 1 END) as totalEdited,
                COUNT(CASE WHEN status = 'ai_processed' THEN 1 END) as totalProcessed,
                AVG(CASE WHEN confidence > 0 THEN confidence END) as averageConfidence
            FROM data_points WHERE project_id = ?
        `).get(projectId);

        db.prepare(`
            INSERT INTO project_stats (project_id, total_accepted, total_rejected, total_edited, total_processed, average_confidence)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(project_id) DO UPDATE SET
              total_accepted=excluded.total_accepted, total_rejected=excluded.total_rejected,
              total_edited=excluded.total_edited, total_processed=excluded.total_processed,
              average_confidence=excluded.average_confidence
        `).run(projectId, stats.totalAccepted || 0, stats.totalRejected || 0,
            stats.totalEdited || 0, stats.totalProcessed || 0, stats.averageConfidence || 0);

        res.json({ success: true, updatedAt: now });
    }));

    // Paginated data points (second route — keeps backward compat with :projectId param)
    app.get('/api/projects/:projectId/data', requireAuth, asyncHandler((req, res) => {
        const { projectId } = req.params;
        const project = db.prepare('SELECT manager_id FROM projects WHERE id = ?').get(projectId);
        if (!project) throw new HttpError(404, 'Project not found');
        assertProjectAccess(req.user, projectId, db);

        const { page, limit, offset } = parsePagination(req.query);
        const total = db.prepare('SELECT COUNT(*) as count FROM data_points WHERE project_id = ?').get(projectId).count;
        const statusCounts = db.prepare(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'accepted'     THEN 1 ELSE 0 END) as accepted,
                SUM(CASE WHEN status = 'edited'       THEN 1 ELSE 0 END) as edited,
                SUM(CASE WHEN status = 'pending'      THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'ai_processed' THEN 1 ELSE 0 END) as aiProcessed,
                SUM(CASE WHEN status = 'rejected'     THEN 1 ELSE 0 END) as rejected
            FROM data_points WHERE project_id = ?
        `).get(projectId);

        const dataPoints = limit
            ? db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at LIMIT ? OFFSET ?').all(projectId, limit, offset)
            : db.prepare('SELECT * FROM data_points WHERE project_id = ? ORDER BY created_at').all(projectId);

        res.json({
            dataPoints: dataPoints.map(formatDataPoint),
            pagination: { total, page, limit, totalPages: limit ? Math.max(1, Math.ceil(total / limit)) : 1 },
            statusCounts: {
                total: statusCounts.total || 0,
                completed: (statusCounts.accepted || 0) + (statusCounts.edited || 0),
                remaining: Math.max(0, (statusCounts.total || 0) - (statusCounts.accepted || 0) - (statusCounts.edited || 0)),
                accepted: statusCounts.accepted || 0,
                edited: statusCounts.edited || 0,
                pending: statusCounts.pending || 0,
                aiProcessed: statusCounts.aiProcessed || 0,
                rejected: statusCounts.rejected || 0
            }
        });
    }));
}

export default { registerProjectRoutes };
