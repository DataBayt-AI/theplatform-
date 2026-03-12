import crypto from 'crypto';
import { getDatabase } from './database.js';

/**
 * Create a notification for a single user.
 * @param {object} opts
 * @param {string} opts.userId   - recipient user id
 * @param {string} opts.type     - 'comment' | 'assignment' | 'review_request'
 * @param {string} opts.title
 * @param {string} opts.body
 * @param {object} [opts.data]   - extra payload, e.g. { projectId, dataPointId }
 */
export function createNotification({ userId, type, title, body, data = {} }) {
  try {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(crypto.randomUUID(), userId, type, title, body, JSON.stringify(data), Date.now());
  } catch (err) {
    // Notifications are best-effort — never crash the caller
    console.error('Failed to create notification:', err);
  }
}

/**
 * Create the same notification for multiple users at once.
 */
export function createNotifications(userIds, opts) {
  for (const userId of userIds) {
    createNotification({ ...opts, userId });
  }
}
