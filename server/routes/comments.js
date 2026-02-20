import crypto from 'crypto';
import { getDatabase } from '../services/database.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parsePagination = (query) => {
    const parsedPage = parseInt(query.page, 10);
    const parsedLimit = parseInt(query.limit, 10);

    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : DEFAULT_PAGE;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, MAX_LIMIT)
        : DEFAULT_LIMIT;
    const offset = (page - 1) * limit;

    return { page, limit, offset };
};

const mapComment = (comment) => ({
    id: comment.id,
    projectId: comment.project_id,
    dataPointId: comment.data_point_id,
    authorId: comment.author_id,
    authorName: comment.author_name,
    body: comment.body,
    parentCommentId: comment.parent_comment_id,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
    deletedAt: comment.deleted_at,
    isEdited: comment.updated_at > comment.created_at
});

const getProject = (db, projectId) => {
    return db.prepare('SELECT id, manager_id FROM projects WHERE id = ?').get(projectId);
};

const hasProjectAccess = (db, projectId, user) => {
    const project = getProject(db, projectId);
    if (!project) {
        return { ok: false, status: 404, error: 'Project not found', project: null };
    }

    if (user.roles?.includes('admin')) {
        return { ok: true, project };
    }

    if (project.manager_id === user.id) {
        return { ok: true, project };
    }

    const isAnnotator = db.prepare(
        'SELECT 1 FROM project_annotators WHERE project_id = ? AND user_id = ?'
    ).get(projectId, user.id);

    if (isAnnotator) {
        return { ok: true, project };
    }

    return { ok: false, status: 403, error: 'Access denied', project };
};

const canDeleteComment = (user, comment, project) => {
    if (!user || !comment) return false;
    if (comment.author_id === user.id) return true;
    if (user.roles?.includes('admin')) return true;
    if (user.roles?.includes('manager') && project?.manager_id === user.id) return true;
    return false;
};

export function registerCommentRoutes(app) {
    const db = getDatabase();

    app.get('/api/projects/:projectId/data/:dataId/comments', (req, res) => {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { projectId, dataId } = req.params;
            const access = hasProjectAccess(db, projectId, user);
            if (!access.ok) {
                return res.status(access.status).json({ error: access.error });
            }

            const dataPoint = db.prepare(
                'SELECT id FROM data_points WHERE id = ? AND project_id = ?'
            ).get(dataId, projectId);
            if (!dataPoint) {
                return res.status(404).json({ error: 'Data point not found in this project' });
            }

            const { page, limit, offset } = parsePagination(req.query);
            const total = db.prepare(
                'SELECT COUNT(*) as count FROM data_point_comments WHERE project_id = ? AND data_point_id = ? AND deleted_at IS NULL'
            ).get(projectId, dataId).count;

            const rows = db.prepare(`
                SELECT *
                FROM data_point_comments
                WHERE project_id = ? AND data_point_id = ? AND deleted_at IS NULL
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
            `).all(projectId, dataId, limit, offset);

            const totalPages = Math.max(1, Math.ceil(total / limit));

            return res.json({
                comments: rows.map(mapComment),
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages
                }
            });
        } catch (error) {
            console.error('Error fetching comments:', error);
            return res.status(500).json({ error: 'Failed to fetch comments' });
        }
    });

    app.post('/api/projects/:projectId/data/:dataId/comments', (req, res) => {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { projectId, dataId } = req.params;
            const access = hasProjectAccess(db, projectId, user);
            if (!access.ok) {
                return res.status(access.status).json({ error: access.error });
            }

            const dataPoint = db.prepare(
                'SELECT id FROM data_points WHERE id = ? AND project_id = ?'
            ).get(dataId, projectId);
            if (!dataPoint) {
                return res.status(404).json({ error: 'Data point not found in this project' });
            }

            const body = String(req.body?.body ?? '').trim();
            const parentCommentId = req.body?.parentCommentId ? String(req.body.parentCommentId) : null;

            if (!body) {
                return res.status(400).json({ error: 'Comment body is required' });
            }
            if (body.length > 5000) {
                return res.status(400).json({ error: 'Comment body exceeds 5000 characters' });
            }

            if (parentCommentId) {
                const parent = db.prepare(`
                    SELECT id FROM data_point_comments
                    WHERE id = ? AND project_id = ? AND data_point_id = ?
                `).get(parentCommentId, projectId, dataId);
                if (!parent) {
                    return res.status(400).json({ error: 'Parent comment not found for this data point' });
                }
            }

            const now = Date.now();
            const id = crypto.randomUUID();

            db.prepare(`
                INSERT INTO data_point_comments (
                    id, project_id, data_point_id, author_id, author_name, body,
                    parent_comment_id, created_at, updated_at, deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                id,
                projectId,
                dataId,
                user.id,
                user.username || 'Unknown',
                body,
                parentCommentId,
                now,
                now,
                null
            );

            const inserted = db.prepare('SELECT * FROM data_point_comments WHERE id = ?').get(id);
            return res.status(201).json(mapComment(inserted));
        } catch (error) {
            console.error('Error creating comment:', error);
            return res.status(500).json({ error: 'Failed to create comment' });
        }
    });

    app.patch('/api/projects/:projectId/comments/:commentId', (req, res) => {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { projectId, commentId } = req.params;
            const access = hasProjectAccess(db, projectId, user);
            if (!access.ok) {
                return res.status(access.status).json({ error: access.error });
            }

            const comment = db.prepare(`
                SELECT * FROM data_point_comments
                WHERE id = ? AND project_id = ?
            `).get(commentId, projectId);

            if (!comment) {
                return res.status(404).json({ error: 'Comment not found' });
            }

            if (comment.deleted_at) {
                return res.status(400).json({ error: 'Cannot edit a deleted comment' });
            }

            if (comment.author_id !== user.id) {
                return res.status(403).json({ error: 'Only the comment author can edit this comment' });
            }

            const body = String(req.body?.body ?? '').trim();
            if (!body) {
                return res.status(400).json({ error: 'Comment body is required' });
            }
            if (body.length > 5000) {
                return res.status(400).json({ error: 'Comment body exceeds 5000 characters' });
            }

            const now = Date.now();
            db.prepare(`
                UPDATE data_point_comments
                SET body = ?, updated_at = ?
                WHERE id = ?
            `).run(body, now, commentId);

            const updated = db.prepare('SELECT * FROM data_point_comments WHERE id = ?').get(commentId);
            return res.json(mapComment(updated));
        } catch (error) {
            console.error('Error updating comment:', error);
            return res.status(500).json({ error: 'Failed to update comment' });
        }
    });

    app.delete('/api/projects/:projectId/comments/:commentId', (req, res) => {
        try {
            const user = req.user;
            if (!user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { projectId, commentId } = req.params;
            const access = hasProjectAccess(db, projectId, user);
            if (!access.ok) {
                return res.status(access.status).json({ error: access.error });
            }

            const comment = db.prepare(`
                SELECT * FROM data_point_comments
                WHERE id = ? AND project_id = ?
            `).get(commentId, projectId);

            if (!comment) {
                return res.status(404).json({ error: 'Comment not found' });
            }

            if (!canDeleteComment(user, comment, access.project)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            if (comment.deleted_at) {
                return res.json({ success: true });
            }

            const now = Date.now();
            db.prepare(`
                UPDATE data_point_comments
                SET deleted_at = ?, updated_at = ?, body = ''
                WHERE id = ?
            `).run(now, now, commentId);

            return res.json({ success: true });
        } catch (error) {
            console.error('Error deleting comment:', error);
            return res.status(500).json({ error: 'Failed to delete comment' });
        }
    });
}

export default { registerCommentRoutes };
