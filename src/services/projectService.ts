import { Project, DataPoint, AnnotationStats } from "@/types/data";
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
    }
};
