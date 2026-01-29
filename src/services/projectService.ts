import { Project, DataPoint, AnnotationStats, ProjectSnapshot } from "@/types/data";
import { dbService } from "./db";

export const projectService = {
    initialize: async () => {
        await dbService.migrateFromLocalStorage();
    },

    normalize: (project: Project): Project => {
        return {
            ...project,
            managerId: project.managerId ?? null,
            annotatorIds: project.annotatorIds ?? []
        };
    },

    getAll: async (): Promise<Project[]> => {
        const projects = await dbService.getAllProjects();
        return projects.map(projectService.normalize);
    },

    getById: async (id: string): Promise<Project | undefined> => {
        const project = await dbService.getProject(id);
        return project ? projectService.normalize(project) : undefined;
    },

    create: async (name: string, description?: string): Promise<Project> => {
        const newProject: Project = {
            id: crypto.randomUUID(),
            name,
            description,
            managerId: null,
            annotatorIds: [],
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

        const normalized = projectService.normalize(newProject);
        await dbService.saveProject(normalized);
        return normalized;
    },

    update: async (project: Project): Promise<void> => {
        const updatedProject = projectService.normalize({ ...project, updatedAt: Date.now() });
        await dbService.saveProject(updatedProject);
    },

    delete: async (id: string): Promise<void> => {
        await dbService.deleteProject(id);
    },

    updateAccess: async (projectId: string, access: { managerId?: string | null; annotatorIds?: string[] }) => {
        const project = await projectService.getById(projectId);
        if (!project) throw new Error("Project not found");
        const updated = {
            ...project,
            managerId: access.managerId ?? project.managerId ?? null,
            annotatorIds: access.annotatorIds ?? project.annotatorIds ?? []
        };
        await projectService.update(updated);
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
