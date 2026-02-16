/**
 * API client for communicating with the backend server
 */

import { ProjectIAAConfig } from "@/types/data";

const API_BASE = '/api';

async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE}${endpoint}`;

    // Get current user from localStorage for auth headers
    const sessionData = localStorage.getItem('databayt_session');
    const session = sessionData ? JSON.parse(sessionData) : null;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    // Add auth headers if session exists
    if (session?.id) {
        headers['x-user-id'] = session.id;
        headers['x-user-role'] = session.roles?.[0] || 'annotator';
    }

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || error.message || 'Request failed');
    }

    return response.json();
}

export const apiClient = {
    // Projects
    projects: {
        getAll: () => request<any[]>('/projects'),

        getById: (id: string) => request<any>(`/projects/${id}`),

        create: (data: {
            name: string;
            description?: string;
            managerId?: string;
            annotatorIds?: string[];
            iaaConfig?: ProjectIAAConfig;
            guidelines?: string;
        }) => request<any>('/projects', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        update: (id: string, data: any) => request<any>(`/projects/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

        getData: (projectId: string, page: number = 1, limit: number = 50) =>
            request<{ dataPoints: any[]; pagination: any }>(`/projects/${projectId}/data?page=${page}&limit=${limit}`),

        updateDataPoint: (projectId: string, dataId: string, updates: any) =>
            request<void>(`/projects/${projectId}/data/${dataId}`, {
                method: 'PATCH',
                body: JSON.stringify(updates),
            }),

        delete: (id: string) => request<{ success: boolean }>(`/projects/${id}`, {
            method: 'DELETE',
        }),

        addAuditLog: (id: string, action: string, details?: any) =>
            request<{ id: string; timestamp: number }>(`/projects/${id}/audit`, {
                method: 'POST',
                body: JSON.stringify({ action, details }),
            }),
    },

    // Snapshots
    snapshots: {
        getAll: (projectId: string) => request<any[]>(`/projects/${projectId}/snapshots`),

        create: (projectId: string, data: {
            name: string;
            description?: string;
            dataPoints: any[];
            stats: any;
        }) => request<{ id: string; createdAt: number }>(`/projects/${projectId}/snapshots`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        delete: (projectId: string, snapshotId: string) =>
            request<{ success: boolean }>(`/projects/${projectId}/snapshots/${snapshotId}`, {
                method: 'DELETE',
            }),
    },

    // Users
    users: {
        getAll: () => request<any[]>('/users'),

        getById: (id: string) => request<any>(`/users/${id}`),

        create: (data: {
            username: string;
            password: string;
            roles?: string[];
            mustChangePassword?: boolean;
        }) => request<any>('/users', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        update: (id: string, data: {
            password?: string;
            roles?: string[];
            mustChangePassword?: boolean;
        }) => request<any>(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

        delete: (id: string) => request<{ success: boolean }>(`/users/${id}`, {
            method: 'DELETE',
        }),
    },

    // Auth
    auth: {
        login: (username: string, password: string) =>
            request<any>('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            }),

        signup: (username: string, password: string, token: string) =>
            request<any>('/auth/signup', {
                method: 'POST',
                body: JSON.stringify({ username, password, token }),
            }),

        me: () => request<any>('/auth/me'),
    },

    // Invite tokens
    invite: {
        getAll: () => request<any[]>('/invite'),

        create: (data: {
            roles?: string[];
            maxUses?: number;
            expiresInDays?: number;
        }) => request<any>('/invite', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        validate: (token: string) => request<{ valid: boolean; roles?: string[]; error?: string }>(`/invite/${token}/validate`),

        toggle: (id: string, isActive: boolean) => request<any>(`/invite/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive }),
        }),

        delete: (id: string) => request<{ success: boolean }>(`/invite/${id}`, {
            method: 'DELETE',
        }),
    },

    // Provider Connections
    connections: {
        getAll: () => request<any[]>('/connections'),

        save: (data: any) => request<any>('/connections', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        delete: (id: string) => request<{ success: boolean }>(`/connections/${id}`, {
            method: 'DELETE',
        }),
    },

    // Model Profiles
    profiles: {
        getAll: () => request<any[]>('/profiles'),

        save: (data: any) => request<any>('/profiles', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

        delete: (id: string) => request<{ success: boolean }>(`/profiles/${id}`, {
            method: 'DELETE',
        }),
    },

    // Project Model Policies
    policies: {
        get: (projectId: string) => request<any>(`/policies/${projectId}`),

        save: (projectId: string, data: {
            allowedModelProfileIds: string[];
            defaultModelProfileIds: string[];
        }) => request<any>(`/policies/${projectId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    },

    // Hugging Face dataset import
    huggingFace: {
        importDataset: (data: {
            dataset: string;
            config?: string;
            split?: string;
            maxRows?: number;
        }) => request<{
            dataset: string;
            config: string;
            split: string;
            columns: string[];
            totalRows: number | null;
            rowCount: number;
            rows: Array<Record<string, unknown>>;
        }>('/huggingface/datasets/import', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    },
};

export default apiClient;
