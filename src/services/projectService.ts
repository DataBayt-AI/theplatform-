import { Project, DataPoint, AnnotationStats, ProjectSnapshot, ProjectAuditEntry, ProjectIAAConfig } from "@/types/data";
import { apiClient } from "./apiClient";

export const projectService = {
    initialize: async () => {
        // No longer need to migrate from localStorage - data is now on server
        // This is kept for backwards compatibility
    },

    normalize: (project: Project): Project => {
        return {
            ...project,
            guidelines: project.guidelines ?? '',
            managerId: project.managerId ?? null,
            annotatorIds: project.annotatorIds ?? [],
            auditLog: project.auditLog ?? [],
            dataPoints: project.dataPoints ?? [],
            iaaConfig: project.iaaConfig ?? {
                enabled: false,
                portionPercent: 0,
                annotatorsPerIAAItem: 2
            },
            stats: project.stats ?? {
                totalAccepted: 0,
                totalRejected: 0,
                totalEdited: 0,
                totalProcessed: 0,
                averageConfidence: 0,
                sessionTime: 0,
            }
        };
    },

    getAll: async (): Promise<Project[]> => {
        try {
            const projects = await apiClient.projects.getAll();
            return projects.map(projectService.normalize);
        } catch (error) {
            console.error('Failed to fetch projects:', error);
            return [];
        }
    },

    getById: async (id: string): Promise<Project | undefined> => {
        try {
            const project = await apiClient.projects.getById(id);
            return project ? projectService.normalize(project) : undefined;
        } catch (error) {
            console.error('Failed to fetch project:', error);
            return undefined;
        }
    },

    getData: async (projectId: string, page: number = 1, limit: number = 50): Promise<{ dataPoints: DataPoint[]; pagination: any }> => {
        try {
            return await apiClient.projects.getData(projectId, page, limit);
        } catch (error) {
            console.error('Failed to fetch project data:', error);
            return { dataPoints: [], pagination: {} };
        }
    },

    create: async (name: string, description?: string, managerId?: string, iaaConfig?: ProjectIAAConfig, guidelines?: string): Promise<Project> => {
        const result = await apiClient.projects.create({ name, description, managerId, iaaConfig, guidelines });
        return projectService.normalize({
            ...result,
            name,
            description,
            guidelines,
            managerId: managerId ?? null,
            annotatorIds: [],
            iaaConfig: iaaConfig ?? {
                enabled: false,
                portionPercent: 0,
                annotatorsPerIAAItem: 2
            },
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
        });
    },

    update: async (project: Project): Promise<void> => {
        await apiClient.projects.update(project.id, {
            name: project.name,
            description: project.description,
            guidelines: project.guidelines,
            managerId: project.managerId,
            annotatorIds: project.annotatorIds,
            xmlConfig: project.xmlConfig,
            uploadPrompt: project.uploadPrompt,
            customFieldName: project.customFieldName,
            dataPoints: project.dataPoints,
            stats: project.stats,
        });
    },

    delete: async (id: string): Promise<void> => {
        await apiClient.projects.delete(id);
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

    appendAuditLog: async (projectId: string, entry: Omit<ProjectAuditEntry, 'id' | 'timestamp'>) => {
        try {
            await apiClient.projects.addAuditLog(projectId, entry.action, entry.details);
        } catch (error) {
            console.error('Failed to add audit log:', error);
        }
    },

    // Helper to save just the data points and stats for a project
    saveProgress: async (projectId: string, dataPoints: DataPoint[], stats: AnnotationStats) => {
        await apiClient.projects.update(projectId, { dataPoints, stats });
    },

    updateDataPoint: async (projectId: string, dataId: string, updates: Partial<DataPoint>): Promise<void> => {
        await apiClient.projects.updateDataPoint(projectId, dataId, updates);
    },

    // Snapshot methods
    createSnapshot: async (projectId: string, name: string, description?: string): Promise<string> => {
        const project = await projectService.getById(projectId);
        if (!project) throw new Error("Project not found");

        const result = await apiClient.snapshots.create(projectId, {
            name,
            description,
            dataPoints: project.dataPoints,
            stats: project.stats,
        });

        return result.id;
    },

    getSnapshots: async (projectId: string): Promise<ProjectSnapshot[]> => {
        try {
            return await apiClient.snapshots.getAll(projectId);
        } catch (error) {
            console.error('Failed to fetch snapshots:', error);
            return [];
        }
    },

    restoreSnapshot: async (snapshotId: string): Promise<void> => {
        // Get all snapshots for all projects to find the one we need
        // This is a bit inefficient but works for now
        // In a real implementation, we'd have a direct API endpoint
        const projects = await projectService.getAll();

        for (const project of projects) {
            const snapshots = await apiClient.snapshots.getAll(project.id);
            const snapshot = snapshots.find(s => s.id === snapshotId);

            if (snapshot) {
                await apiClient.projects.update(project.id, {
                    dataPoints: snapshot.dataPoints,
                    stats: snapshot.stats,
                });
                return;
            }
        }

        throw new Error("Snapshot not found");
    },

    deleteSnapshot: async (projectId: string, snapshotId: string): Promise<void> => {
        await apiClient.snapshots.delete(projectId, snapshotId);
    }
};
