import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Adjust path to point to the correct data location
// detailed in server/services/database.js: path.join(DATA_DIR, 'databayt.sqlite')
const DB_PATH = path.resolve('/Users/ahmed/Desktop/databaytai/Labeler/annotate-ai-muse/server/data/databayt.sqlite');

console.log(`Checking database at: ${DB_PATH}`);

try {
    const db = new Database(DB_PATH, { readonly: true });

    // Check users
    const users = db.prepare('SELECT id, username, roles FROM users').all();
    console.log('\nUsers:', users);

    // Check projects
    const projects = db.prepare('SELECT id, name, manager_id FROM projects').all();
    console.log('\nProjects:', projects);

} catch (err) {
    console.error('Error reading database:', err);
}
