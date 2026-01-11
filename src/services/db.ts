import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Project } from '@/types/data';

interface LabelerDB extends DBSchema {
    projects: {
        key: string;
        value: Project;
        indexes: { 'by-date': number };
    };
}

const DB_NAME = 'databayt-labeler-db';
const DB_VERSION = 1;

export const dbService = {
    dbPromise: null as Promise<IDBPDatabase<LabelerDB>> | null,

    getDB: async () => {
        if (!dbService.dbPromise) {
            dbService.dbPromise = openDB<LabelerDB>(DB_NAME, DB_VERSION, {
                upgrade(db) {
                    const store = db.createObjectStore('projects', { keyPath: 'id' });
                    store.createIndex('by-date', 'updatedAt');
                },
            });
        }
        return dbService.dbPromise;
    },

    getAllProjects: async (): Promise<Project[]> => {
        const db = await dbService.getDB();
        return db.getAllFromIndex('projects', 'by-date');
    },

    getProject: async (id: string): Promise<Project | undefined> => {
        const db = await dbService.getDB();
        return db.get('projects', id);
    },

    saveProject: async (project: Project): Promise<string> => {
        const db = await dbService.getDB();
        await db.put('projects', project);
        return project.id;
    },

    deleteProject: async (id: string): Promise<void> => {
        const db = await dbService.getDB();
        await db.delete('projects', id);
    },

    // Migration helper
    migrateFromLocalStorage: async () => {
        const STORAGE_KEY = "databayt_projects";
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const projects: Project[] = JSON.parse(data);
                if (Array.isArray(projects) && projects.length > 0) {
                    console.log(`Migrating ${projects.length} projects from localStorage to IndexedDB...`);
                    const db = await dbService.getDB();
                    const tx = db.transaction('projects', 'readwrite');
                    await Promise.all([
                        ...projects.map(p => tx.store.put(p)),
                        tx.done
                    ]);
                    console.log('Migration complete.');
                    // Optional: Clear localStorage after successful migration
                    // localStorage.removeItem(STORAGE_KEY); 
                    // Keeping it for now as a backup
                }
            }
        } catch (error) {
            console.error("Migration failed:", error);
        }
    }
};
