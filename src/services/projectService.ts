import { Project, DataPoint, AnnotationStats, ProjectSnapshot } from "@/types/data";
import { dbService } from "./db";

export const projectService = {
    initialize: async () => {
        await dbService.migrateFromLocalStorage();
    },

    getAll: async (): Promise<Project[]> => {
        return await dbService.getAllProjects();
    },

    getById: async (id: string): Promise<Project | undefined> => {
        return await dbService.getProject(id);
    },

    create: async (name: string, description?: string): Promise<Project> => {
        const newProject: Project = {
            id: crypto.randomUUID(),
            name,
            description,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            dataPoints: [],
            stats: {
                totalAccepted: 0,
                totalRejected: 0,
                totalEdited: 0,
                totalProcessed: 0,
                averageConfidence: 0,
                sessionTime: 0,
            },
        };

        await dbService.saveProject(newProject);
        return newProject;
    },

    update: async (project: Project): Promise<void> => {
        const updatedProject = { ...project, updatedAt: Date.now() };
        await dbService.saveProject(updatedProject);
    },

    delete: async (id: string): Promise<void> => {
        await dbService.deleteProject(id);
    },

    // Helper to save just the data points and stats for a project
    saveProgress: async (projectId: string, dataPoints: DataPoint[], stats: AnnotationStats) => {
        const project = await projectService.getById(projectId);
        if (project) {
            project.dataPoints = dataPoints;
            project.stats = stats;
            await projectService.update(project);
        }
    },

    // Snapshot methods
    createSnapshot: async (projectId: string, name: string, description?: string): Promise<string> => {
        const project = await projectService.getById(projectId);
        if (!project) throw new Error("Project not found");

        const snapshot: ProjectSnapshot = {
            id: crypto.randomUUID(),
            projectId: project.id,
            name,
            description,
            createdAt: Date.now(),
            dataPoints: [...project.dataPoints], // Deep copy if needed, but shallow copy of array is usually enough for immutable items
            stats: { ...project.stats }
        };

        return await dbService.saveSnapshot(snapshot);
    },

    getSnapshots: async (projectId: string): Promise<ProjectSnapshot[]> => {
        return await dbService.getSnapshots(projectId);
    },

    restoreSnapshot: async (snapshotId: string): Promise<void> => {
        // 1. Get snapshot
        const db = await dbService.getDB();
        const snapshot = await db.get('snapshots', snapshotId);
        if (!snapshot) throw new Error("Snapshot not found");

        // 2. Get current project
        const project = await projectService.getById(snapshot.projectId);
        if (!project) throw new Error("Project not found");

        // 3. Update project with snapshot data
        project.dataPoints = snapshot.dataPoints;
        project.stats = snapshot.stats;
        project.updatedAt = Date.now();

        // 4. Save project
        await projectService.update(project);
    }
};
