/**
 * Regression tests — Users API
 *
 * Covers:
 *  - GET  /api/users          (admin ✓, manager ✓, annotator ✗, unauthenticated ✗)
 *  - GET  /api/users/:id      (found, not found)
 *  - POST /api/users          (admin creates, non-admin blocked, duplicate username, weak password)
 *  - PUT  /api/users/:id      (self password change, admin role change, non-admin role change blocked)
 *  - DELETE /api/users/:id    (admin deletes, non-admin blocked, self-delete blocked, not found)
 */

process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long!!';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// In-memory DB
// ---------------------------------------------------------------------------
let testDb;

vi.mock('../services/database.js', () => ({
  getDatabase: () => testDb,
  initDatabase: () => testDb,
  closeDatabase: () => {},
}));

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      roles TEXT NOT NULL DEFAULT '["annotator"]',
      must_change_password INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      manager_id TEXT,
      xml_config TEXT,
      upload_prompt TEXT,
      custom_field_name TEXT,
      guidelines TEXT,
      iaa_config TEXT,
      is_demo INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_annotators (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (project_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS project_stats (
      project_id TEXT PRIMARY KEY,
      total_accepted INTEGER DEFAULT 0,
      total_rejected INTEGER DEFAULT 0,
      total_edited INTEGER DEFAULT 0,
      total_processed INTEGER DEFAULT 0,
      average_confidence REAL DEFAULT 0,
      session_time INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS data_points (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      original_annotation TEXT,
      human_annotation TEXT,
      final_annotation TEXT,
      ai_suggestions TEXT DEFAULT '{}',
      ratings TEXT DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      confidence REAL,
      upload_prompt TEXT,
      custom_field TEXT,
      custom_field_name TEXT,
      custom_field_values TEXT DEFAULT '{}',
      metadata TEXT DEFAULT '{}',
      display_metadata TEXT DEFAULT '{}',
      split TEXT,
      annotator_id TEXT,
      annotator_name TEXT,
      annotated_at INTEGER,
      is_iaa INTEGER DEFAULT 0,
      assignments TEXT DEFAULT '[]',
      qa_status TEXT DEFAULT 'pending_review',
      qa_reviewer_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invite_tokens (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      created_by TEXT NOT NULL,
      default_roles TEXT DEFAULT '["annotator"]',
      max_uses INTEGER DEFAULT 0,
      current_uses INTEGER DEFAULT 0,
      expires_at INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      is_read INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS task_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'Custom',
      xml_config TEXT NOT NULL,
      is_global INTEGER DEFAULT 0,
      created_by TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET;

function makeToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, roles: user.roles },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function seedUser(db, overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const now = Date.now();
  const defaults = {
    id,
    username: `user_${id.slice(0, 6)}`,
    password: bcrypt.hashSync('password123', 4),
    roles: JSON.stringify(['annotator']),
    must_change_password: 0,
    created_at: now,
    updated_at: now,
  };
  const row = { ...defaults, ...overrides };
  db.prepare(`
    INSERT INTO users (id, username, password, roles, must_change_password, created_at, updated_at)
    VALUES (@id, @username, @password, @roles, @must_change_password, @created_at, @updated_at)
  `).run(row);
  return { ...row, roles: JSON.parse(row.roles) };
}

async function buildApp() {
  const { registerUserRoutes } = await import('../routes/users.js');
  const { attachUser } = await import('../middleware/auth.js');
  const { errorHandler } = await import('../middleware/errors.js');
  const app = express();
  app.use(express.json());
  app.use(attachUser);
  registerUserRoutes(app);
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------
describe('GET /api/users', () => {
  let app;

  beforeEach(async () => {
    testDb = new Database(':memory:');
    applySchema(testDb);
    app = await buildApp();
  });

  afterEach(() => {
    testDb.close();
    vi.resetModules();
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });

  it('returns 403 for annotator', async () => {
    const user = seedUser(testDb, { roles: JSON.stringify(['annotator']) });
    const token = makeToken(user);
    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 + user list for admin', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    seedUser(testDb, { username: 'alice' });
    const token = makeToken(admin);

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
  });

  it('returns 200 + user list for manager', async () => {
    const manager = seedUser(testDb, { username: 'mgr', roles: JSON.stringify(['manager']) });
    const token = makeToken(manager);

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('response does not expose password field', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    res.body.forEach(u => {
      expect(u).not.toHaveProperty('password');
    });
  });

  it('response contains expected fields', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const [first] = res.body;
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('username');
    expect(first).toHaveProperty('roles');
    expect(first).toHaveProperty('mustChangePassword');
    expect(first).toHaveProperty('createdAt');
    expect(first).toHaveProperty('updatedAt');
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/:id
// ---------------------------------------------------------------------------
describe('GET /api/users/:id', () => {
  let app;

  beforeEach(async () => {
    testDb = new Database(':memory:');
    applySchema(testDb);
    app = await buildApp();
  });

  afterEach(() => {
    testDb.close();
    vi.resetModules();
  });

  it('returns user data for existing id', async () => {
    const user = seedUser(testDb, { username: 'alice' });
    const res = await request(app).get(`/api/users/${user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.username).toBe('alice');
    expect(res.body).not.toHaveProperty('password');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get(`/api/users/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// POST /api/users
// ---------------------------------------------------------------------------
describe('POST /api/users', () => {
  let app;

  beforeEach(async () => {
    testDb = new Database(':memory:');
    applySchema(testDb);
    app = await buildApp();
  });

  afterEach(() => {
    testDb.close();
    vi.resetModules();
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ username: 'newuser', password: 'pass123' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin (manager)', async () => {
    const mgr = seedUser(testDb, { username: 'mgr', roles: JSON.stringify(['manager']) });
    const token = makeToken(mgr);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newuser', password: 'pass123' });
    expect(res.status).toBe(403);
  });

  it('returns 403 for annotator', async () => {
    const annotator = seedUser(testDb, { username: 'ann', roles: JSON.stringify(['annotator']) });
    const token = makeToken(annotator);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newuser', password: 'pass123' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when username is missing', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'pass123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 400 when password is missing', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newuser' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 400 for password shorter than 5 characters', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newuser', password: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5 characters/i);
  });

  it('returns 409 for duplicate username', async () => {
    seedUser(testDb, { username: 'alice' });
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'alice', password: 'pass123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it('returns 201 and created user for valid admin request', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newuser', password: 'pass123', roles: ['annotator'] });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.username).toBe('newuser');
    expect(res.body.roles).toContain('annotator');
    expect(res.body).not.toHaveProperty('password');
  });

  it('strips invalid roles from the request', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'hacker', password: 'pass123', roles: ['superuser', 'annotator'] });

    expect(res.status).toBe(201);
    expect(res.body.roles).not.toContain('superuser');
    expect(res.body.roles).toContain('annotator');
  });

  it('password is stored as bcrypt hash in DB', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newuser', password: 'pass123' });

    const row = testDb.prepare('SELECT password FROM users WHERE username = ?').get('newuser');
    expect(row.password).toMatch(/^\$2/);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/users/:id
// ---------------------------------------------------------------------------
describe('PUT /api/users/:id', () => {
  let app;

  beforeEach(async () => {
    testDb = new Database(':memory:');
    applySchema(testDb);
    app = await buildApp();
  });

  afterEach(() => {
    testDb.close();
    vi.resetModules();
  });

  it('allows a user to change their own password', async () => {
    const user = seedUser(testDb, { username: 'alice', password: bcrypt.hashSync('old', 4) });
    const token = makeToken(user);

    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'newpass123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify new password is bcrypt hashed
    const row = testDb.prepare('SELECT password FROM users WHERE id = ?').get(user.id);
    expect(row.password).toMatch(/^\$2/);
    const valid = await bcrypt.compare('newpass123', row.password);
    expect(valid).toBe(true);
  });

  it('returns 400 when new password is too short (self update)', async () => {
    const user = seedUser(testDb, { username: 'alice' });
    const token = makeToken(user);

    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'ab' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/5 characters/i);
  });

  it('blocks non-admin from changing another user\'s password', async () => {
    const alice = seedUser(testDb, { username: 'alice' });
    const bob = seedUser(testDb, { username: 'bob' });
    const token = makeToken(alice);

    const res = await request(app)
      .put(`/api/users/${bob.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'newpass123' });

    expect(res.status).toBe(403);
  });

  it('blocks non-admin from changing roles', async () => {
    const user = seedUser(testDb, { username: 'alice', roles: JSON.stringify(['annotator']) });
    const token = makeToken(user);

    const res = await request(app)
      .put(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roles: ['admin'] });

    expect(res.status).toBe(403);
  });

  it('allows admin to change another user\'s roles', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const alice = seedUser(testDb, { username: 'alice', roles: JSON.stringify(['annotator']) });
    const token = makeToken(admin);

    const res = await request(app)
      .put(`/api/users/${alice.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roles: ['manager'] });

    expect(res.status).toBe(200);
    const row = testDb.prepare('SELECT roles FROM users WHERE id = ?').get(alice.id);
    expect(JSON.parse(row.roles)).toContain('manager');
  });

  it('returns 404 when target user does not exist', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);

    const res = await request(app)
      .put(`/api/users/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'pass123' });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/users/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/users/:id', () => {
  let app;

  beforeEach(async () => {
    testDb = new Database(':memory:');
    applySchema(testDb);
    app = await buildApp();
  });

  afterEach(() => {
    testDb.close();
    vi.resetModules();
  });

  it('returns 401 for unauthenticated request', async () => {
    const res = await request(app).delete(`/api/users/${crypto.randomUUID()}`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin', async () => {
    const ann = seedUser(testDb, { username: 'ann', roles: JSON.stringify(['annotator']) });
    const target = seedUser(testDb, { username: 'target' });
    const token = makeToken(ann);

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 400 when admin tries to delete their own account', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);

    const res = await request(app)
      .delete(`/api/users/${admin.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/own account/i);
  });

  it('returns 404 when user does not exist', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const token = makeToken(admin);

    const res = await request(app)
      .delete(`/api/users/${crypto.randomUUID()}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('successfully deletes a user and returns 200', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const target = seedUser(testDb, { username: 'target' });
    const token = makeToken(admin);

    const res = await request(app)
      .delete(`/api/users/${target.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const row = testDb.prepare('SELECT id FROM users WHERE id = ?').get(target.id);
    expect(row).toBeUndefined();
  });
});
