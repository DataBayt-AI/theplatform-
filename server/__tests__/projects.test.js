/**
 * Regression tests — Projects API
 *
 * Covers:
 *  - GET /api/projects           (unauthenticated ✗, admin sees all, manager sees managed+assigned,
 *                                  annotator sees only assigned, project isolation)
 *  - GET /api/projects/:id/annotator-stats (admin ✓, manager ✓, annotator ✗)
 *  - Response shape (no extra DB columns leaked)
 *  - N+1 regression: annotatorIds present for every project in the list
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

// Mock notificationService used by project routes
vi.mock('../services/notificationService.js', () => ({
  createNotification: vi.fn(),
  createNotifications: vi.fn(),
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
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      data_points TEXT NOT NULL,
      stats TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      actor_id TEXT,
      actor_name TEXT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS data_point_comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      data_point_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      body TEXT NOT NULL,
      parent_comment_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS project_model_policies (
      project_id TEXT PRIMARY KEY,
      allowed_profile_ids TEXT DEFAULT '[]',
      default_profile_ids TEXT DEFAULT '[]',
      updated_at INTEGER NOT NULL
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
    password: bcrypt.hashSync('pw', 4),
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

function seedProject(db, overrides = {}) {
  const id = overrides.id ?? crypto.randomUUID();
  const now = Date.now();
  const defaults = {
    id,
    name: `Project ${id.slice(0, 6)}`,
    description: null,
    manager_id: null,
    xml_config: null,
    upload_prompt: null,
    custom_field_name: null,
    guidelines: null,
    iaa_config: null,
    is_demo: 0,
    created_at: now,
    updated_at: now,
  };
  const row = { ...defaults, ...overrides };
  db.prepare(`
    INSERT INTO projects (id, name, description, manager_id, xml_config, upload_prompt,
      custom_field_name, guidelines, iaa_config, is_demo, created_at, updated_at)
    VALUES (@id, @name, @description, @manager_id, @xml_config, @upload_prompt,
      @custom_field_name, @guidelines, @iaa_config, @is_demo, @created_at, @updated_at)
  `).run(row);
  db.prepare('INSERT INTO project_stats (project_id) VALUES (?)').run(id);
  return row;
}

function assignAnnotator(db, projectId, userId) {
  db.prepare('INSERT OR IGNORE INTO project_annotators (project_id, user_id) VALUES (?, ?)')
    .run(projectId, userId);
}

async function buildApp() {
  const { registerProjectRoutes } = await import('../routes/projects.js');
  const { attachUser } = await import('../middleware/auth.js');
  const { errorHandler } = await import('../middleware/errors.js');
  const app = express();
  app.use(express.json());
  app.use(attachUser);
  registerProjectRoutes(app);
  app.use(errorHandler);
  return app;
}

// ---------------------------------------------------------------------------
// GET /api/projects — access control
// ---------------------------------------------------------------------------
describe('GET /api/projects — access control', () => {
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
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  it('admin sees all projects including unrelated ones', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const mgr = seedUser(testDb, { username: 'mgr', roles: JSON.stringify(['manager']) });
    seedProject(testDb, { name: 'Project A', manager_id: mgr.id });
    seedProject(testDb, { name: 'Project B', manager_id: mgr.id });
    const token = makeToken(admin);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });

  it('manager sees only projects they manage', async () => {
    const mgr = seedUser(testDb, { username: 'mgr', roles: JSON.stringify(['manager']) });
    const other = seedUser(testDb, { username: 'other_mgr', roles: JSON.stringify(['manager']) });
    seedProject(testDb, { name: 'My Project', manager_id: mgr.id });
    seedProject(testDb, { name: 'Other Project', manager_id: other.id });
    const token = makeToken(mgr);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const names = res.body.map(p => p.name);
    expect(names).toContain('My Project');
    expect(names).not.toContain('Other Project');
  });

  it('manager also sees projects they are assigned to as annotator', async () => {
    const mgr = seedUser(testDb, { username: 'mgr', roles: JSON.stringify(['manager']) });
    const other_mgr = seedUser(testDb, { username: 'other', roles: JSON.stringify(['manager']) });
    const ownProject = seedProject(testDb, { name: 'Own', manager_id: mgr.id });
    const assignedProject = seedProject(testDb, { name: 'Assigned', manager_id: other_mgr.id });
    assignAnnotator(testDb, assignedProject.id, mgr.id);
    const token = makeToken(mgr);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const names = res.body.map(p => p.name);
    expect(names).toContain('Own');
    expect(names).toContain('Assigned');
  });

  it('annotator sees only assigned projects', async () => {
    const ann = seedUser(testDb, { username: 'ann', roles: JSON.stringify(['annotator']) });
    const mgr = seedUser(testDb, { username: 'mgr', roles: JSON.stringify(['manager']) });
    const assigned = seedProject(testDb, { name: 'Assigned', manager_id: mgr.id });
    const unassigned = seedProject(testDb, { name: 'Unassigned', manager_id: mgr.id });
    assignAnnotator(testDb, assigned.id, ann.id);
    const token = makeToken(ann);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const names = res.body.map(p => p.name);
    expect(names).toContain('Assigned');
    expect(names).not.toContain('Unassigned');
  });

  it('annotator with no assignments sees empty list', async () => {
    const ann = seedUser(testDb, { username: 'ann', roles: JSON.stringify(['annotator']) });
    const mgr = seedUser(testDb, { username: 'mgr', roles: JSON.stringify(['manager']) });
    seedProject(testDb, { name: 'Some Project', manager_id: mgr.id });
    const token = makeToken(ann);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects — response shape
// ---------------------------------------------------------------------------
describe('GET /api/projects — response shape', () => {
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

  it('each project has expected fields', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    seedProject(testDb, { name: 'Alpha' });
    const token = makeToken(admin);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const [p] = res.body;
    expect(p).toHaveProperty('id');
    expect(p).toHaveProperty('name');
    expect(p).toHaveProperty('description');
    expect(p).toHaveProperty('managerId');
    expect(p).toHaveProperty('annotatorIds');
    expect(p).toHaveProperty('xmlConfig');
    expect(p).toHaveProperty('guidelines');
    expect(p).toHaveProperty('totalDataPoints');
    expect(p).toHaveProperty('createdAt');
    expect(p).toHaveProperty('updatedAt');
    expect(p).toHaveProperty('stats');
  });

  it('does not leak raw DB column names like manager_id or xml_config', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    seedProject(testDb, { name: 'Alpha' });
    const token = makeToken(admin);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    const [p] = res.body;
    expect(p).not.toHaveProperty('manager_id');
    expect(p).not.toHaveProperty('xml_config');
    expect(p).not.toHaveProperty('updated_at');
    expect(p).not.toHaveProperty('created_at');
  });

  it('annotatorIds is always an array (even for projects with no annotators)', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    seedProject(testDb, { name: 'Solo' });
    const token = makeToken(admin);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body[0].annotatorIds)).toBe(true);
  });

  it('annotatorIds contains assigned user ids', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const ann1 = seedUser(testDb, { username: 'ann1' });
    const ann2 = seedUser(testDb, { username: 'ann2' });
    const project = seedProject(testDb, { name: 'Team' });
    assignAnnotator(testDb, project.id, ann1.id);
    assignAnnotator(testDb, project.id, ann2.id);
    const token = makeToken(admin);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const [p] = res.body;
    expect(p.annotatorIds).toContain(ann1.id);
    expect(p.annotatorIds).toContain(ann2.id);
  });

  it('totalDataPoints reflects actual count', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const project = seedProject(testDb, { name: 'With Data' });
    const now = Date.now();

    // Insert 3 data points
    for (let i = 0; i < 3; i++) {
      testDb.prepare(`
        INSERT INTO data_points (id, project_id, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), project.id, `item ${i}`, now, now);
    }

    const token = makeToken(admin);
    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const found = res.body.find(p => p.id === project.id);
    expect(found.totalDataPoints).toBe(3);
  });

  it('stats object has expected keys with numeric defaults', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    seedProject(testDb, { name: 'Stats' });
    const token = makeToken(admin);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    const stats = res.body[0].stats;
    expect(stats).toHaveProperty('totalAccepted');
    expect(stats).toHaveProperty('totalRejected');
    expect(stats).toHaveProperty('totalEdited');
    expect(stats).toHaveProperty('totalProcessed');
    expect(stats).toHaveProperty('averageConfidence');
    expect(stats).toHaveProperty('sessionTime');
    expect(typeof stats.totalAccepted).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects — annotator isolation (cross-user data leak check)
// ---------------------------------------------------------------------------
describe('GET /api/projects — cross-user isolation', () => {
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

  it('annotator A cannot see annotator B\'s private project', async () => {
    const annA = seedUser(testDb, { username: 'annA', roles: JSON.stringify(['annotator']) });
    const annB = seedUser(testDb, { username: 'annB', roles: JSON.stringify(['annotator']) });
    const mgr = seedUser(testDb, { username: 'mgr', roles: JSON.stringify(['manager']) });
    const projectForB = seedProject(testDb, { name: 'B Only', manager_id: mgr.id });
    assignAnnotator(testDb, projectForB.id, annB.id);
    const token = makeToken(annA);

    const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const ids = res.body.map(p => p.id);
    expect(ids).not.toContain(projectForB.id);
  });

  it('two annotators on the same project both see it', async () => {
    const annA = seedUser(testDb, { username: 'annA', roles: JSON.stringify(['annotator']) });
    const annB = seedUser(testDb, { username: 'annB', roles: JSON.stringify(['annotator']) });
    const mgr = seedUser(testDb, { username: 'mgr', roles: JSON.stringify(['manager']) });
    const shared = seedProject(testDb, { name: 'Shared', manager_id: mgr.id });
    assignAnnotator(testDb, shared.id, annA.id);
    assignAnnotator(testDb, shared.id, annB.id);

    const resA = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${makeToken(annA)}`);
    const resB = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${makeToken(annB)}`);

    expect(resA.body.map(p => p.id)).toContain(shared.id);
    expect(resB.body.map(p => p.id)).toContain(shared.id);
  });
});

// ---------------------------------------------------------------------------
// GET /api/projects/:id/annotator-stats
// ---------------------------------------------------------------------------
describe('GET /api/projects/:id/annotator-stats', () => {
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

  it('returns 401 for unauthenticated', async () => {
    const project = seedProject(testDb, { name: 'P' });
    const res = await request(app).get(`/api/projects/${project.id}/annotator-stats`);
    expect(res.status).toBe(401);
  });

  it('returns 403 for annotator', async () => {
    const ann = seedUser(testDb, { username: 'ann', roles: JSON.stringify(['annotator']) });
    const project = seedProject(testDb, { name: 'P' });
    assignAnnotator(testDb, project.id, ann.id);
    const token = makeToken(ann);

    const res = await request(app)
      .get(`/api/projects/${project.id}/annotator-stats`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 for admin with { projectId, annotators, summary } shape', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const project = seedProject(testDb, { name: 'P' });
    const token = makeToken(admin);

    const res = await request(app)
      .get(`/api/projects/${project.id}/annotator-stats`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('projectId', project.id);
    expect(Array.isArray(res.body.annotators)).toBe(true);
    expect(res.body).toHaveProperty('summary');
  });

  it('returns 200 for manager', async () => {
    const mgr = seedUser(testDb, { username: 'mgr', roles: JSON.stringify(['manager']) });
    const project = seedProject(testDb, { name: 'P', manager_id: mgr.id });
    const token = makeToken(mgr);

    const res = await request(app)
      .get(`/api/projects/${project.id}/annotator-stats`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('annotators');
  });

  it('annotators array contains per-annotator stats when data points exist', async () => {
    const admin = seedUser(testDb, { username: 'admin', roles: JSON.stringify(['admin']) });
    const ann = seedUser(testDb, { username: 'ann' });
    const project = seedProject(testDb, { name: 'P' });
    const now = Date.now();

    testDb.prepare(`
      INSERT INTO data_points
        (id, project_id, content, annotator_id, annotator_name, status, annotated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?)
    `).run(crypto.randomUUID(), project.id, 'test content', ann.id, 'ann', now, now, now);

    const token = makeToken(admin);
    const res = await request(app)
      .get(`/api/projects/${project.id}/annotator-stats`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.annotators.length).toBeGreaterThan(0);
    const stat = res.body.annotators[0];
    // Route returns camelCase fields
    expect(stat).toHaveProperty('annotatorId', ann.id);
    expect(stat).toHaveProperty('totalAnnotated', 1);
    expect(stat).toHaveProperty('editRate');
    expect(stat).toHaveProperty('rejectionRate');
  });
});
