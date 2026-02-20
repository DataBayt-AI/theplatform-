import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file location
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'databayt.sqlite');

let db = null;

/**
 * Initialize the database connection and create schema if needed
 */
export function initDatabase() {
  if (db) return db;

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log(`Initializing database at: ${DB_PATH}`);
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create schema
  createSchema();

  console.log('Database initialized successfully');
  return db;
}

/**
 * Get the database instance
 */
export function getDatabase() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * Create database schema
 */
function createSchema() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      roles TEXT NOT NULL DEFAULT '["annotator"]',
      must_change_password INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      manager_id TEXT,
      xml_config TEXT,
      upload_prompt TEXT,
      custom_field_name TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Project annotators (many-to-many)
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_annotators (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Data points table
  db.exec(`
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
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (annotator_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // Project stats table
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_stats (
      project_id TEXT PRIMARY KEY,
      total_accepted INTEGER DEFAULT 0,
      total_rejected INTEGER DEFAULT 0,
      total_edited INTEGER DEFAULT 0,
      total_processed INTEGER DEFAULT 0,
      average_confidence REAL DEFAULT 0,
      session_time INTEGER DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Snapshots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      data_points TEXT NOT NULL,
      stats TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Audit log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      actor_id TEXT,
      actor_name TEXT,
      action TEXT NOT NULL,
      details TEXT,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Data point comments table
  db.exec(`
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
      deleted_at INTEGER,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (data_point_id) REFERENCES data_points(id) ON DELETE CASCADE,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_comment_id) REFERENCES data_point_comments(id) ON DELETE SET NULL
    )
  `);

  // Provider connections table
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_connections (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL,
      api_key TEXT,
      base_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Model profiles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_profiles (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      default_prompt TEXT,
      temperature REAL,
      max_tokens INTEGER,
      input_price_per_million REAL,
      output_price_per_million REAL,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (connection_id) REFERENCES provider_connections(id) ON DELETE CASCADE
    )
  `);

  // Project model policies table
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_model_policies (
      project_id TEXT PRIMARY KEY,
      allowed_profile_ids TEXT DEFAULT '[]',
      default_profile_ids TEXT DEFAULT '[]',
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
  `);

  // Invite tokens table for user registration
  db.exec(`
    CREATE TABLE IF NOT EXISTS invite_tokens (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      created_by TEXT NOT NULL,
      default_roles TEXT DEFAULT '["annotator"]',
      max_uses INTEGER DEFAULT 0,
      current_uses INTEGER DEFAULT 0,
      expires_at INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_data_points_project ON data_points(project_id);
    CREATE INDEX IF NOT EXISTS idx_data_points_status ON data_points(status);
    CREATE INDEX IF NOT EXISTS idx_comments_project_data_point ON data_point_comments(project_id, data_point_id);
    CREATE INDEX IF NOT EXISTS idx_comments_created_at ON data_point_comments(created_at);
    CREATE INDEX IF NOT EXISTS idx_snapshots_project ON snapshots(project_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_project ON audit_log(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_annotators_user ON project_annotators(user_id);
    CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
  `);

  // Seed default admin user if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    const now = Date.now();
    db.prepare(`
      INSERT INTO users (id, username, password, roles, must_change_password, created_at, updated_at)
      VALUES (?, 'admin', 'admin', '["admin","manager","annotator"]', 0, ?, ?)
    `).run(crypto.randomUUID(), now, now);
    console.log('Created default admin user (username: admin, password: admin)');
  }
}

/**
 * Close the database connection
 */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export default { initDatabase, getDatabase, closeDatabase };
