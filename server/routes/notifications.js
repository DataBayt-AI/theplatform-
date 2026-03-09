import { getDatabase } from '../services/database.js';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

const mapNotification = (row) => ({
  id: row.id,
  userId: row.user_id,
  type: row.type,
  title: row.title,
  body: row.body,
  data: (() => { try { return JSON.parse(row.data); } catch { return {}; } })(),
  isRead: row.is_read === 1,
  createdAt: row.created_at,
});

export function registerNotificationRoutes(app) {
  const db = getDatabase();

  // GET /api/notifications — list for the current user
  app.get('/api/notifications', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

    const unreadOnly = req.query.unread === 'true';

    try {
      const whereClause = unreadOnly
        ? 'WHERE user_id = ? AND is_read = 0'
        : 'WHERE user_id = ?';

      const rows = db.prepare(`
        SELECT * FROM notifications
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ?
      `).all(user.id, limit);

      const unreadCount = db.prepare(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
      ).get(user.id).count;

      return res.json({
        notifications: rows.map(mapNotification),
        unreadCount,
      });
    } catch (err) {
      console.error('Error fetching notifications:', err);
      return res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  });

  // POST /api/notifications/read — mark as read
  // Body: { ids: string[] }  OR  { all: true }
  app.post('/api/notifications/read', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      if (req.body?.all === true) {
        db.prepare(
          'UPDATE notifications SET is_read = 1 WHERE user_id = ?'
        ).run(user.id);
      } else {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
        if (ids.length === 0) return res.json({ success: true });

        const placeholders = ids.map(() => '?').join(', ');
        db.prepare(
          `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (${placeholders})`
        ).run(user.id, ...ids);
      }

      const unreadCount = db.prepare(
        'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
      ).get(user.id).count;

      return res.json({ success: true, unreadCount });
    } catch (err) {
      console.error('Error marking notifications read:', err);
      return res.status(500).json({ error: 'Failed to update notifications' });
    }
  });

  // DELETE /api/notifications/:id
  app.delete('/api/notifications/:id', (req, res) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const result = db.prepare(
        'DELETE FROM notifications WHERE id = ? AND user_id = ?'
      ).run(req.params.id, user.id);

      if (result.changes === 0) {
        return res.status(404).json({ error: 'Notification not found' });
      }
      return res.json({ success: true });
    } catch (err) {
      console.error('Error deleting notification:', err);
      return res.status(500).json({ error: 'Failed to delete notification' });
    }
  });
}

export default { registerNotificationRoutes };
