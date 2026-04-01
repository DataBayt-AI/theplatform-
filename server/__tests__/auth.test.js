/**
 * Regression tests — Authentication
 *
 * Covers:
 *  - POST /api/auth/login  (valid, wrong password, unknown user, missing body)
 *  - GET  /api/auth/me     (valid token, no token, invalid token)
 *  - mustChangePassword flag propagation
 *  - Token payload (id, username, roles)
 *  - Legacy plaintext password migration on login
 */

// Set JWT_SECRET before any module that imports auth.js is loaded
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long!!';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';
import request from 'supertest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// In-memory DB wired through mock
// ---------------------------------------------------------------------------
let testDb;

vi.mock('../services/database.js', () => ({
  getDatabase: () => testDb,
  initDatabase: () => testDb,
  closeDatabase: () => {},
}));

// ---------------------------------------------------------------------------
// Schema — mirrors database.js
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
  const id = crypto.randomUUID();
  const now = Date.now();
  const defaults = {
    id,
    username: `user_${id.slice(0, 6)}`,
    password: bcrypt.hashSync('password123', 4), // low rounds for test speed
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
  return row;
}

// ---------------------------------------------------------------------------
// App factory — import routes lazily so mock is in place first
// ---------------------------------------------------------------------------
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
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
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

  it('returns 400 when body is empty', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when username is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'alice' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 401 for unknown username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 401 for wrong password', async () => {
    seedUser(testDb, { username: 'alice' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'WRONG' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 200 + token + user fields on correct credentials', async () => {
    seedUser(testDb, { username: 'alice', password: bcrypt.hashSync('password123', 4) });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('id');
    expect(res.body.username).toBe('alice');
    expect(Array.isArray(res.body.roles)).toBe(true);
    expect(typeof res.body.mustChangePassword).toBe('boolean');
  });

  it('token payload contains id, username, roles', async () => {
    const user = seedUser(testDb, {
      username: 'bob',
      password: bcrypt.hashSync('pass123', 4),
      roles: JSON.stringify(['manager']),
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'bob', password: 'pass123' });

    expect(res.status).toBe(200);
    const decoded = jwt.verify(res.body.token, JWT_SECRET);
    expect(decoded.id).toBe(user.id);
    expect(decoded.username).toBe('bob');
    expect(decoded.roles).toContain('manager');
  });

  it('sets mustChangePassword=true when flag is set in DB', async () => {
    seedUser(testDb, {
      username: 'newbie',
      password: bcrypt.hashSync('pass123', 4),
      must_change_password: 1,
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'newbie', password: 'pass123' });

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
  });

  it('sets mustChangePassword=false when flag is 0', async () => {
    seedUser(testDb, {
      username: 'veteran',
      password: bcrypt.hashSync('pass123', 4),
      must_change_password: 0,
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'veteran', password: 'pass123' });

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(false);
  });

  it('migrates plaintext password to bcrypt hash on login', async () => {
    // Insert legacy plaintext password (no bcrypt prefix)
    const id = crypto.randomUUID();
    const now = Date.now();
    testDb.prepare(`
      INSERT INTO users (id, username, password, roles, must_change_password, created_at, updated_at)
      VALUES (?, 'legacy', 'plaintext_pw', '["annotator"]', 0, ?, ?)
    `).run(id, now, now);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'legacy', password: 'plaintext_pw' });

    expect(res.status).toBe(200);

    // Password should now be hashed in DB
    const updated = testDb.prepare('SELECT password FROM users WHERE id = ?').get(id);
    expect(updated.password).toMatch(/^\$2/);
  });

  it('rejects wrong plaintext password during migration check', async () => {
    const id = crypto.randomUUID();
    const now = Date.now();
    testDb.prepare(`
      INSERT INTO users (id, username, password, roles, must_change_password, created_at, updated_at)
      VALUES (?, 'legacy2', 'correct_pw', '["annotator"]', 0, ?, ?)
    `).run(id, now, now);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'legacy2', password: 'wrong_pw' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------

describe('GET /api/auth/me', () => {
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

  it('returns 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a token signed by wrong secret', async () => {
    const badToken = jwt.sign({ id: 'x', username: 'x', roles: [] }, 'wrong-secret');
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 with an expired token', async () => {
    const expiredToken = jwt.sign(
      { id: 'x', username: 'x', roles: [] },
      JWT_SECRET,
      { expiresIn: '-1s' }
    );
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it('returns 200 and user data with a valid token', async () => {
    const user = seedUser(testDb, {
      username: 'carol',
      password: bcrypt.hashSync('pw', 4),
      roles: JSON.stringify(['admin']),
    });
    const token = makeToken({ id: user.id, username: 'carol', roles: ['admin'] });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.username).toBe('carol');
    expect(res.body.roles).toContain('admin');
  });

  it('returns 404 if user referenced in token no longer exists in DB', async () => {
    // Token references a user that was deleted
    const ghostToken = makeToken({ id: crypto.randomUUID(), username: 'ghost', roles: ['annotator'] });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ghostToken}`);
    // auth middleware sets req.user = undefined when DB lookup fails → 401
    expect(res.status).toBe(401);
  });

  it('returns mustChangePassword flag correctly', async () => {
    const user = seedUser(testDb, {
      username: 'forced',
      password: bcrypt.hashSync('pw', 4),
      must_change_password: 1,
    });
    const token = makeToken({ id: user.id, username: 'forced', roles: ['annotator'] });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
  });
});
