import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve('/Users/ahmed/Desktop/databaytai/Labeler/annotate-ai-muse/server/data/databayt.sqlite');

console.log(`Checking database at: ${DB_PATH}`);

try {
    const db = new Database(DB_PATH, { readonly: true });

    // Check data points
    const dataPoints = db.prepare('SELECT id, project_id, content FROM data_points LIMIT 20').all();
    console.log('\nData Points:', dataPoints);

    // Check duplicate IDs (should be impossible due to PK, but just to be sure layout)
    const counts = db.prepare('SELECT id, COUNT(*) as c FROM data_points GROUP BY id HAVING c > 1').all();
    if (counts.length > 0) {
        console.log('\nDuplicate IDs found (unexpected for PK):', counts);
    } else {
        console.log('\nNo duplicate IDs found (as expected for PK).');
    }

} catch (err) {
    console.error('Error reading database:', err);
}
