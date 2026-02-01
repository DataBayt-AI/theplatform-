import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Project, ProjectSnapshot } from '@/types/data';

interface LabelerDB extends DBSchema {
    projects: {
        key: string;
        value: Project;
        indexes: { 'by-date': number };
    };
    snapshots: {
        key: string;
        value: ProjectSnapshot;
        indexes: { 'by-project': string };
    };
}

const DB_NAME = 'databayt-labeler-db';
const DB_VERSION = 2; // Incremented for snapshots

export const dbService = {
    dbPromise: null as Promise<IDBPDatabase<LabelerDB>> | null,

    getDB: async () => {
        if (!dbService.dbPromise) {
            dbService.dbPromise = openDB<LabelerDB>(DB_NAME, DB_VERSION, {
                upgrade(db, oldVersion) {
                    if (oldVersion < 1) {
                        const store = db.createObjectStore('projects', { keyPath: 'id' });
                        store.createIndex('by-date', 'updatedAt');
                    }
                    if (oldVersion < 2) {
                        const snapshotStore = db.createObjectStore('snapshots', { keyPath: 'id' });
                        snapshotStore.createIndex('by-project', 'projectId');
                    }
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
        // Also delete associated snapshots
        const tx = db.transaction('snapshots', 'readwrite');
        const index = tx.store.index('by-project');
        const snapshots = await index.getAllKeys(id);
        await Promise.all([
            ...snapshots.map(key => tx.store.delete(key)),
            tx.done
        ]);
    },

    // Snapshot methods
    saveSnapshot: async (snapshot: ProjectSnapshot): Promise<string> => {
        const db = await dbService.getDB();
        await db.put('snapshots', snapshot);
        return snapshot.id;
    },

    getSnapshots: async (projectId: string): Promise<ProjectSnapshot[]> => {
        const db = await dbService.getDB();
        return db.getAllFromIndex('snapshots', 'by-project', projectId);
    },

    deleteSnapshot: async (id: string): Promise<void> => {
        const db = await dbService.getDB();
        await db.delete('snapshots', id);
    },

    // Migration helper
    migrateFromLocalStorage: async () => {
        const STORAGE_KEY = "databayt_projects";
        const MIGRATED_KEY = "databayt_migration_completed";

        // Check if migration was already marked as complete
        if (localStorage.getItem(MIGRATED_KEY)) {
            return;
        }

        try {
            const db = await dbService.getDB();
            const count = await db.count('projects');

            // If we already have data in IndexedDB, assume migration is done or not needed
            if (count > 0) {
                console.log("IndexedDB has data, skipping migration and cleaning up localStorage.");
                localStorage.setItem(MIGRATED_KEY, "true");
                localStorage.removeItem(STORAGE_KEY);
                return;
            }

            const data = localStorage.getItem(STORAGE_KEY);
            if (data) {
                const projects: Project[] = JSON.parse(data);
                if (Array.isArray(projects) && projects.length > 0) {
                    console.log(`Migrating ${projects.length} projects from localStorage to IndexedDB...`);
                    const tx = db.transaction('projects', 'readwrite');
                    await Promise.all([
                        ...projects.map(p => tx.store.put(p)),
                        tx.done
                    ]);
                    console.log('Migration complete.');

                    // Mark as migrated and clean up
                    localStorage.setItem(MIGRATED_KEY, "true");
                    localStorage.removeItem(STORAGE_KEY);
                }
            }
        } catch (error) {
            console.error("Migration failed:", error);
        }
    }
};
