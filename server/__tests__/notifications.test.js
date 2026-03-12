/**
 * Comprehensive test suite for the Notification System
 *
 * Covers:
 *  - notificationService: createNotification, createNotifications
 *  - GET  /api/notifications
 *  - POST /api/notifications/read
 *  - DELETE /api/notifications/:id
 *  - Comment POST side-effect: notifications fired to annotator + manager
 *  - Project POST side-effect: notifications fired to assigned annotators
 *  - Project PUT side-effect: only *newly added* annotators notified
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// In-memory DB wired up through the mock
// ---------------------------------------------------------------------------
let testDb;

vi.mock('../services/database.js', () => ({
  // Closures over testDb — by the time they're called, beforeEach has assigned it
  getDatabase: () => testDb,
  initDatabase: () => testDb,
  closeDatabase: () => {},
}));

// ---------------------------------------------------------------------------
// Schema helper — mirrors database.js exactly
// ---------------------------------------------------------------------------
function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      roles TEXT NOT NULL DEFAULT '["annotator"]',
      must_change_password INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
      manager_id TEXT, xml_config TEXT, upload_prompt TEXT,
      custom_field_name TEXT, guidelines TEXT, iaa_config TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_annotators (
      project_id TEXT NOT NULL, user_id TEXT NOT NULL,
      PRIMARY KEY (project_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS project_stats (
      project_id TEXT PRIMARY KEY,
      total_accepted INTEGER DEFAULT 0, total_rejected INTEGER DEFAULT 0,
      total_edited INTEGER DEFAULT 0, total_processed INTEGER DEFAULT 0,
      average_confidence REAL DEFAULT 0, session_time INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS data_points (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, content TEXT NOT NULL,
      type TEXT DEFAULT 'text', original_annotation TEXT, human_annotation TEXT,
      final_annotation TEXT, ai_suggestions TEXT DEFAULT '{}',
      ratings TEXT DEFAULT '{}', status TEXT DEFAULT 'pending',
      confidence REAL, upload_prompt TEXT, custom_field TEXT,
      custom_field_name TEXT, custom_field_values TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}', display_metadata TEXT DEFAULT '{}',
      split TEXT, annotator_id TEXT, annotator_name TEXT,
      annotated_at INTEGER, is_iaa INTEGER DEFAULT 0,
      assignments TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS data_point_comments (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL,
      data_point_id TEXT NOT NULL, author_id TEXT NOT NULL,
      author_name TEXT NOT NULL, body TEXT NOT NULL,
      parent_comment_id TEXT, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, body TEXT NOT NULL,
      data TEXT DEFAULT '{}', is_read INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notif_user
      ON notifications(user_id, is_read, created_at);
  `);
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
const NOW = Date.now();

function seedUser(db, overrides = {}) {
  const user = {
    id: crypto.randomUUID(),
    username: `user_${Math.random().toString(36).slice(2, 8)}`,
    password: 'pw',
    roles: JSON.stringify(['annotator']),
    must_change_password: 0,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
  db.prepare(`
    INSERT INTO users (id, username, password, roles, must_change_password, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, user.username, user.password, user.roles, user.must_change_password, user.created_at, user.updated_at);
  return { ...user, roles: JSON.parse(user.roles) };
}

function seedProject(db, managerId, overrides = {}) {
  const project = {
    id: crypto.randomUUID(),
    name: 'Test Project',
    manager_id: managerId,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
  db.prepare(`
    INSERT INTO projects (id, name, manager_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(project.id, project.name, project.manager_id, project.created_at, project.updated_at);
  db.prepare('INSERT INTO project_stats (project_id) VALUES (?)').run(project.id);
  return project;
}

function seedDataPoint(db, projectId, annotatorId = null) {
  const dp = {
    id: crypto.randomUUID(),
    project_id: projectId,
    content: 'sample text',
    annotator_id: annotatorId,
    created_at: NOW,
    updated_at: NOW,
  };
  db.prepare(`
    INSERT INTO data_points (id, project_id, content, annotator_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(dp.id, dp.project_id, dp.content, dp.annotator_id, dp.created_at, dp.updated_at);
  return dp;
}

function seedNotification(db, userId, overrides = {}) {
  const n = {
    id: crypto.randomUUID(),
    user_id: userId,
    type: 'comment',
    title: 'Test notif',
    body: 'A body',
    data: '{}',
    is_read: 0,
    created_at: NOW,
    ...overrides,
  };
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(n.id, n.user_id, n.type, n.title, n.body, n.data, n.is_read, n.created_at);
  return n;
}

// ---------------------------------------------------------------------------
// Route capture helper
// ---------------------------------------------------------------------------
function captureRoutes(registerFn) {
  const handlers = {};
  const mockApp = {
    get:    (path, handler) => { handlers[`GET ${path}`]    = handler; },
    post:   (path, handler) => { handlers[`POST ${path}`]   = handler; },
    delete: (path, handler) => { handlers[`DELETE ${path}`] = handler; },
    patch:  (path, handler) => { handlers[`PATCH ${path}`]  = handler; },
    put:    (path, handler) => { handlers[`PUT ${path}`]    = handler; },
    param:  () => {},
  };
  registerFn(mockApp);
  return handlers;
}

// Mock res builder
function mockRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Import modules under test — happens AFTER vi.mock is in place
// ---------------------------------------------------------------------------
const { createNotification, createNotifications } =
  await import('../services/notificationService.js');
const { registerNotificationRoutes } =
  await import('../routes/notifications.js');
const { registerCommentRoutes } =
  await import('../routes/comments.js');
const { registerProjectRoutes } =
  await import('../routes/projects.js');

// ============================================================================
// 1. notificationService
// ============================================================================
describe('notificationService', () => {
  beforeEach(() => {
    testDb = new Database(':memory:');
    applySchema(testDb);
  });

  it('createNotification inserts a row with correct fields', () => {
    const user = seedUser(testDb);
    createNotification({
      userId: user.id,
      type: 'assignment',
      title: 'Hello',
      body: 'You were assigned',
      data: { projectId: 'proj-1' },
    });

    const rows = testDb.prepare('SELECT * FROM notifications WHERE user_id = ?').all(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('assignment');
    expect(rows[0].title).toBe('Hello');
    expect(rows[0].body).toBe('You were assigned');
    expect(JSON.parse(rows[0].data)).toEqual({ projectId: 'proj-1' });
    expect(rows[0].is_read).toBe(0);
  });

  it('createNotification does not throw when DB fails (best-effort)', () => {
    // Pass a bad userId that violates FK — should silently swallow error
    expect(() => {
      createNotification({ userId: null, type: 'x', title: 'x', body: 'x' });
    }).not.toThrow();
  });

  it('createNotifications creates one row per userId', () => {
    const u1 = seedUser(testDb);
    const u2 = seedUser(testDb);
    const u3 = seedUser(testDb);

    createNotifications([u1.id, u2.id, u3.id], {
      type: 'comment',
      title: 'Multi',
      body: 'Sent to all',
    });

    const count = testDb.prepare('SELECT COUNT(*) as c FROM notifications').get().c;
    expect(count).toBe(3);
  });

  it('createNotifications with empty array inserts nothing', () => {
    createNotifications([], { type: 'comment', title: 'x', body: 'x' });
    const count = testDb.prepare('SELECT COUNT(*) as c FROM notifications').get().c;
    expect(count).toBe(0);
  });
});

// ============================================================================
// 2. GET /api/notifications
// ============================================================================
describe('GET /api/notifications', () => {
  let routes, user, other;

  beforeEach(() => {
    testDb = new Database(':memory:');
    applySchema(testDb);
    user  = seedUser(testDb);
    other = seedUser(testDb);
    routes = captureRoutes(registerNotificationRoutes);
  });

  it('returns 401 when unauthenticated', async () => {
    const req = { user: null, query: {} };
    const res = mockRes();
    routes['GET /api/notifications'](req, res);
    expect(res._status).toBe(401);
  });

  it('returns only the current user\'s notifications', () => {
    seedNotification(testDb, user.id,  { title: 'Mine' });
    seedNotification(testDb, other.id, { title: 'NotMine' });

    const req = { user, query: {} };
    const res = mockRes();
    routes['GET /api/notifications'](req, res);

    expect(res._status).toBe(200);
    expect(res._body.notifications).toHaveLength(1);
    expect(res._body.notifications[0].title).toBe('Mine');
  });

  it('returns correct unreadCount', () => {
    seedNotification(testDb, user.id, { is_read: 0 });
    seedNotification(testDb, user.id, { is_read: 0 });
    seedNotification(testDb, user.id, { is_read: 1 });

    const req = { user, query: {} };
    const res = mockRes();
    routes['GET /api/notifications'](req, res);

    expect(res._body.unreadCount).toBe(2);
  });

  it('returns all notifications (read + unread) by default', () => {
    seedNotification(testDb, user.id, { is_read: 0 });
    seedNotification(testDb, user.id, { is_read: 1 });

    const req = { user, query: {} };
    const res = mockRes();
    routes['GET /api/notifications'](req, res);

    expect(res._body.notifications).toHaveLength(2);
  });

  it('filters to unread only when ?unread=true', () => {
    seedNotification(testDb, user.id, { is_read: 0, title: 'Unread' });
    seedNotification(testDb, user.id, { is_read: 1, title: 'Read' });

    const req = { user, query: { unread: 'true' } };
    const res = mockRes();
    routes['GET /api/notifications'](req, res);

    expect(res._body.notifications).toHaveLength(1);
    expect(res._body.notifications[0].title).toBe('Unread');
  });

  it('returns notifications ordered newest first', () => {
    seedNotification(testDb, user.id, { title: 'Old',    created_at: NOW - 10000 });
    seedNotification(testDb, user.id, { title: 'Middle', created_at: NOW - 5000 });
    seedNotification(testDb, user.id, { title: 'New',    created_at: NOW });

    const req = { user, query: {} };
    const res = mockRes();
    routes['GET /api/notifications'](req, res);

    const titles = res._body.notifications.map(n => n.title);
    expect(titles).toEqual(['New', 'Middle', 'Old']);
  });

  it('deserialises the data JSON field', () => {
    seedNotification(testDb, user.id, {
      data: JSON.stringify({ projectId: 'p1', dataPointId: 'dp1' }),
    });

    const req = { user, query: {} };
    const res = mockRes();
    routes['GET /api/notifications'](req, res);

    expect(res._body.notifications[0].data).toEqual({ projectId: 'p1', dataPointId: 'dp1' });
  });

  it('maps isRead correctly', () => {
    seedNotification(testDb, user.id, { is_read: 0 });
    seedNotification(testDb, user.id, { is_read: 1 });

    const req = { user, query: {} };
    const res = mockRes();
    routes['GET /api/notifications'](req, res);

    const readFlags = res._body.notifications.map(n => n.isRead).sort();
    expect(readFlags).toEqual([false, true]);
  });
});

// ============================================================================
// 3. POST /api/notifications/read
// ============================================================================
describe('POST /api/notifications/read', () => {
  let routes, user, other;

  beforeEach(() => {
    testDb = new Database(':memory:');
    applySchema(testDb);
    user  = seedUser(testDb);
    other = seedUser(testDb);
    routes = captureRoutes(registerNotificationRoutes);
  });

  it('returns 401 when unauthenticated', () => {
    const req = { user: null, body: { ids: [] } };
    const res = mockRes();
    routes['POST /api/notifications/read'](req, res);
    expect(res._status).toBe(401);
  });

  it('marks specific IDs as read', () => {
    const n1 = seedNotification(testDb, user.id, { is_read: 0 });
    const n2 = seedNotification(testDb, user.id, { is_read: 0 });

    const req = { user, body: { ids: [n1.id] } };
    const res = mockRes();
    routes['POST /api/notifications/read'](req, res);

    expect(res._body.success).toBe(true);
    const updated = testDb.prepare('SELECT is_read FROM notifications WHERE id = ?').get(n1.id);
    const untouched = testDb.prepare('SELECT is_read FROM notifications WHERE id = ?').get(n2.id);
    expect(updated.is_read).toBe(1);
    expect(untouched.is_read).toBe(0);
  });

  it('marks all as read when body.all = true', () => {
    seedNotification(testDb, user.id, { is_read: 0 });
    seedNotification(testDb, user.id, { is_read: 0 });
    seedNotification(testDb, user.id, { is_read: 0 });

    const req = { user, body: { all: true } };
    const res = mockRes();
    routes['POST /api/notifications/read'](req, res);

    expect(res._body.success).toBe(true);
    expect(res._body.unreadCount).toBe(0);
    const remaining = testDb.prepare(
      'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(user.id).c;
    expect(remaining).toBe(0);
  });

  it('does not mark another user\'s notifications as read', () => {
    const otherNotif = seedNotification(testDb, other.id, { is_read: 0 });

    const req = { user, body: { ids: [otherNotif.id] } };
    const res = mockRes();
    routes['POST /api/notifications/read'](req, res);

    const row = testDb.prepare('SELECT is_read FROM notifications WHERE id = ?').get(otherNotif.id);
    expect(row.is_read).toBe(0); // still unread
  });

  it('returns updated unreadCount after partial mark-read', () => {
    const n1 = seedNotification(testDb, user.id, { is_read: 0 });
    seedNotification(testDb, user.id, { is_read: 0 });

    const req = { user, body: { ids: [n1.id] } };
    const res = mockRes();
    routes['POST /api/notifications/read'](req, res);

    expect(res._body.unreadCount).toBe(1);
  });

  it('handles empty ids array gracefully', () => {
    seedNotification(testDb, user.id, { is_read: 0 });

    const req = { user, body: { ids: [] } };
    const res = mockRes();
    routes['POST /api/notifications/read'](req, res);

    expect(res._body.success).toBe(true);
    const count = testDb.prepare(
      'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0'
    ).get(user.id).c;
    expect(count).toBe(1); // unchanged
  });
});

// ============================================================================
// 4. DELETE /api/notifications/:id
// ============================================================================
describe('DELETE /api/notifications/:id', () => {
  let routes, user, other;

  beforeEach(() => {
    testDb = new Database(':memory:');
    applySchema(testDb);
    user  = seedUser(testDb);
    other = seedUser(testDb);
    routes = captureRoutes(registerNotificationRoutes);
  });

  it('returns 401 when unauthenticated', () => {
    const req = { user: null, params: { id: 'x' } };
    const res = mockRes();
    routes['DELETE /api/notifications/:id'](req, res);
    expect(res._status).toBe(401);
  });

  it('deletes the notification and returns success', () => {
    const n = seedNotification(testDb, user.id);

    const req = { user, params: { id: n.id } };
    const res = mockRes();
    routes['DELETE /api/notifications/:id'](req, res);

    expect(res._body.success).toBe(true);
    const row = testDb.prepare('SELECT * FROM notifications WHERE id = ?').get(n.id);
    expect(row).toBeUndefined();
  });

  it('returns 404 for a non-existent notification', () => {
    const req = { user, params: { id: 'does-not-exist' } };
    const res = mockRes();
    routes['DELETE /api/notifications/:id'](req, res);
    expect(res._status).toBe(404);
  });

  it('returns 404 when trying to delete another user\'s notification', () => {
    const otherNotif = seedNotification(testDb, other.id);

    const req = { user, params: { id: otherNotif.id } };
    const res = mockRes();
    routes['DELETE /api/notifications/:id'](req, res);

    expect(res._status).toBe(404);
    // Confirm it still exists
    const row = testDb.prepare('SELECT * FROM notifications WHERE id = ?').get(otherNotif.id);
    expect(row).toBeDefined();
  });
});

// ============================================================================
// 5. Comment POST side-effect: notifications
// ============================================================================
describe('Comment POST → notification side-effects', () => {
  let routes, manager, annotator, commenter, project, dp;

  beforeEach(() => {
    testDb = new Database(':memory:');
    applySchema(testDb);

    manager   = seedUser(testDb, { roles: JSON.stringify(['manager']) });
    annotator = seedUser(testDb, { roles: JSON.stringify(['annotator']) });
    commenter = seedUser(testDb, { roles: JSON.stringify(['annotator']) });

    project = seedProject(testDb, manager.id);

    // Add commenter and annotator to the project
    testDb.prepare('INSERT INTO project_annotators VALUES (?, ?)').run(project.id, annotator.id);
    testDb.prepare('INSERT INTO project_annotators VALUES (?, ?)').run(project.id, commenter.id);

    // Data point assigned to annotator
    dp = seedDataPoint(testDb, project.id, annotator.id);

    routes = captureRoutes(registerCommentRoutes);
  });

  it('notifies the data point annotator when someone else comments', () => {
    const req = {
      user: commenter,
      params: { projectId: project.id, dataId: dp.id },
      body: { body: 'Great annotation!' },
    };
    const res = mockRes();
    routes[`POST /api/projects/:projectId/data/:dataId/comments`](req, res);

    expect(res._status).toBe(201);

    const notif = testDb.prepare(
      'SELECT * FROM notifications WHERE user_id = ?'
    ).get(annotator.id);
    expect(notif).toBeDefined();
    expect(notif.type).toBe('comment');
    expect(JSON.parse(notif.data).projectId).toBe(project.id);
    expect(JSON.parse(notif.data).dataPointId).toBe(dp.id);
  });

  it('notifies the project manager when someone comments', () => {
    const req = {
      user: commenter,
      params: { projectId: project.id, dataId: dp.id },
      body: { body: 'Looks good' },
    };
    const res = mockRes();
    routes[`POST /api/projects/:projectId/data/:dataId/comments`](req, res);

    const notif = testDb.prepare(
      'SELECT * FROM notifications WHERE user_id = ?'
    ).get(manager.id);
    expect(notif).toBeDefined();
    expect(notif.type).toBe('comment');
  });

  it('does NOT notify the commenter themselves', () => {
    // commenter comments on their own data point scenario
    const ownDp = seedDataPoint(testDb, project.id, commenter.id);

    const req = {
      user: commenter,
      params: { projectId: project.id, dataId: ownDp.id },
      body: { body: 'Self-comment' },
    };
    const res = mockRes();
    routes[`POST /api/projects/:projectId/data/:dataId/comments`](req, res);

    const notif = testDb.prepare(
      'SELECT * FROM notifications WHERE user_id = ?'
    ).get(commenter.id);
    expect(notif).toBeUndefined();
  });

  it('does NOT notify the manager when the manager themselves comments', () => {
    const req = {
      user: manager,  // manager is the commenter
      params: { projectId: project.id, dataId: dp.id },
      body: { body: 'Manager comment' },
    };
    const res = mockRes();
    routes[`POST /api/projects/:projectId/data/:dataId/comments`](req, res);

    const managerNotif = testDb.prepare(
      'SELECT * FROM notifications WHERE user_id = ?'
    ).get(manager.id);
    expect(managerNotif).toBeUndefined();
  });
});

// ============================================================================
// 6. Project routes side-effect: assignment notifications
// ============================================================================
describe('Project routes → assignment notification side-effects', () => {
  let routes, admin, annotator1, annotator2;

  beforeEach(() => {
    testDb = new Database(':memory:');
    applySchema(testDb);

    admin      = seedUser(testDb, { roles: JSON.stringify(['admin', 'manager']) });
    annotator1 = seedUser(testDb);
    annotator2 = seedUser(testDb);

    routes = captureRoutes(registerProjectRoutes);
  });

  it('POST /api/projects notifies all assigned annotators on creation', () => {
    const req = {
      user: admin,
      body: {
        name: 'New Project',
        annotatorIds: [annotator1.id, annotator2.id],
      },
    };
    const res = mockRes();
    routes['POST /api/projects'](req, res);

    expect(res._status).toBe(201);

    const notifs = testDb.prepare('SELECT * FROM notifications').all();
    expect(notifs).toHaveLength(2);
    const recipientIds = notifs.map(n => n.user_id).sort();
    expect(recipientIds).toEqual([annotator1.id, annotator2.id].sort());
    notifs.forEach(n => {
      expect(n.type).toBe('assignment');
      expect(JSON.parse(n.data).projectId).toBe(res._body.id);
    });
  });

  it('POST /api/projects with no annotators sends no notifications', () => {
    const req = {
      user: admin,
      body: { name: 'Solo Project', annotatorIds: [] },
    };
    const res = mockRes();
    routes['POST /api/projects'](req, res);

    const count = testDb.prepare('SELECT COUNT(*) as c FROM notifications').get().c;
    expect(count).toBe(0);
  });

  it('PUT /api/projects/:id notifies only NEWLY added annotators', () => {
    // Create project with annotator1 already assigned
    const createReq = {
      user: admin,
      body: { name: 'Existing Project', annotatorIds: [annotator1.id] },
    };
    const createRes = mockRes();
    routes['POST /api/projects'](createReq, createRes);
    const projectId = createRes._body.id;

    // Clear notifications from creation
    testDb.prepare('DELETE FROM notifications').run();

    // Update project to also include annotator2
    const updateReq = {
      user: admin,
      params: { id: projectId },
      body: {
        name: 'Existing Project',
        annotatorIds: [annotator1.id, annotator2.id],
      },
    };
    const updateRes = mockRes();
    routes['PUT /api/projects/:id'](updateReq, updateRes);

    const notifs = testDb.prepare('SELECT * FROM notifications').all();
    // Only annotator2 is NEW — annotator1 was already there
    expect(notifs).toHaveLength(1);
    expect(notifs[0].user_id).toBe(annotator2.id);
    expect(notifs[0].type).toBe('assignment');
  });

  it('PUT /api/projects/:id sends NO notifications when annotator list unchanged', () => {
    const createReq = {
      user: admin,
      body: { name: 'Stable Project', annotatorIds: [annotator1.id] },
    };
    const createRes = mockRes();
    routes['POST /api/projects'](createReq, createRes);
    const projectId = createRes._body.id;

    testDb.prepare('DELETE FROM notifications').run();

    const updateReq = {
      user: admin,
      params: { id: projectId },
      body: { name: 'Stable Project', annotatorIds: [annotator1.id] },
    };
    const updateRes = mockRes();
    routes['PUT /api/projects/:id'](updateReq, updateRes);

    const count = testDb.prepare('SELECT COUNT(*) as c FROM notifications').get().c;
    expect(count).toBe(0);
  });
});
