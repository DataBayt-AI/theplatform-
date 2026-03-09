/**
 * Seed script — injects sample notifications for every user in the DB.
 * Run once to simulate a ready scenario:
 *
 *   node server/scripts/seed-notifications.js
 */

import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'data', 'databayt.sqlite');

const db = new Database(DB_PATH);

const users = db.prepare('SELECT id, username FROM users').all();
if (users.length === 0) {
  console.error('No users found. Start the server at least once first.');
  process.exit(1);
}

// Grab first available project (if any) for realistic data links
const project = db.prepare('SELECT id, name FROM projects LIMIT 1').get();
const dataPoint = project
  ? db.prepare('SELECT id FROM data_points WHERE project_id = ? LIMIT 1').get(project.id)
  : null;

const now = Date.now();
const minute = 60_000;

const templates = [
  {
    type: 'assignment',
    title: 'You were assigned to a project',
    body: `You have been added as an annotator on "${project?.name ?? 'Sentiment Analysis v2'}"`,
    data: { projectId: project?.id ?? 'demo-project-1' },
    offsetMs: -5 * minute,
    is_read: 0,
  },
  {
    type: 'comment',
    title: 'New comment',
    body: `alice commented on an item in "${project?.name ?? 'Sentiment Analysis v2'}"`,
    data: { projectId: project?.id ?? 'demo-project-1', dataPointId: dataPoint?.id ?? 'demo-dp-1' },
    offsetMs: -12 * minute,
    is_read: 0,
  },
  {
    type: 'comment',
    title: 'New comment',
    body: 'manager replied to your comment on item #42',
    data: { projectId: project?.id ?? 'demo-project-1', dataPointId: dataPoint?.id ?? 'demo-dp-1' },
    offsetMs: -30 * minute,
    is_read: 0,
  },
  {
    type: 'assignment',
    title: 'You were assigned to a project',
    body: 'You have been added as an annotator on "NER Tagging — Medical"',
    data: { projectId: 'demo-project-2' },
    offsetMs: -2 * 60 * minute,
    is_read: 1,
  },
  {
    type: 'comment',
    title: 'New comment',
    body: 'bob left a note on item #7 in "NER Tagging — Medical"',
    data: { projectId: 'demo-project-2', dataPointId: 'demo-dp-7' },
    offsetMs: -5 * 60 * minute,
    is_read: 1,
  },
];

const insert = db.prepare(`
  INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

let created = 0;
for (const user of users) {
  for (const t of templates) {
    insert.run(
      crypto.randomUUID(),
      user.id,
      t.type,
      t.title,
      t.body,
      JSON.stringify(t.data),
      t.is_read,
      now + t.offsetMs
    );
    created++;
  }
  console.log(`  ✓ ${user.username}: ${templates.length} notifications seeded`);
}

console.log(`\nDone — ${created} notifications inserted across ${users.length} user(s).`);
console.log('Refresh the app — the bell should show 3 unread notifications per user.');
db.close();
