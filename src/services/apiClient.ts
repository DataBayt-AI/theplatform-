/**
 * API client for communicating with the backend server
 */

import { ProjectIAAConfig } from "@/types/data";
import type { ProjectDataStatusCounts, AnnotatorStatsResponse, TaskTemplate, IAAStats } from "@/types/data";

export interface AppNotification {
    id: string;
    userId: string;
    type: 'comment' | 'assignment' | 'review_request' | string;
    title: string;
    body: string;
    data: { projectId?: string; dataPointId?: string; [key: string]: unknown };
    isRead: boolean;
    createdAt: number;
}

const API_BASE = '/api';

// Module-level token store — set by AuthContext after login
let _authToken: string | null = null;

export function setAuthToken(token: string | null): void {
    _authToken = token;
}

export function getAuthToken(): string | null {
    return _authToken;
}

async function request<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE}${endpoint}`;

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
    };

    // Attach JWT Bearer token if available
    if (_authToken) {
        headers['Authorization'] = `Bearer ${_authToken}`;
    }

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
    });

    if (response.status === 401) {
        // Token expired or invalid — clear stored token
        _authToken = null;
        sessionStorage.removeItem('databayt_token');
        throw new Error('Session expired. Please log in again.');
    }

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

        getData: (projectId: string, page: number = 1, limit?: number) => {
            const params = new URLSearchParams();
            if (page > 0) params.set('page', String(page));
            if (typeof limit === 'number' && limit > 0) params.set('limit', String(limit));
            return request<{ dataPoints: any[]; pagination: any; statusCounts?: ProjectDataStatusCounts }>(
                `/projects/${projectId}/data${params.toString() ? `?${params.toString()}` : ''}`
            );
        },

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

        getAnnotatorStats: (projectId: string) =>
            request<AnnotatorStatsResponse>(`/projects/${projectId}/annotator-stats`),
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

    // Comments
    comments: {
        getByDataPoint: (projectId: string, dataId: string, page: number = 1, limit: number = 20) => {
            const params = new URLSearchParams();
            if (page > 0) params.set('page', String(page));
            if (limit > 0) params.set('limit', String(limit));
            return request<{ comments: any[]; pagination: { total: number; page: number; limit: number; totalPages: number } }>(
                `/projects/${projectId}/data/${dataId}/comments${params.toString() ? `?${params.toString()}` : ''}`
            );
        },

        create: (projectId: string, dataId: string, data: { body: string; parentCommentId?: string | null }) =>
            request<any>(`/projects/${projectId}/data/${dataId}/comments`, {
                method: 'POST',
                body: JSON.stringify(data),
            }),

        update: (projectId: string, commentId: string, data: { body: string }) =>
            request<any>(`/projects/${projectId}/comments/${commentId}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
            }),

        delete: (projectId: string, commentId: string) =>
            request<{ success: boolean }>(`/projects/${projectId}/comments/${commentId}`, {
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

    // Notifications
    notifications: {
        getAll: (params?: { unread?: boolean; limit?: number }) => {
            const query = new URLSearchParams();
            if (params?.unread) query.set('unread', 'true');
            if (params?.limit) query.set('limit', String(params.limit));
            const qs = query.toString();
            return request<{ notifications: AppNotification[]; unreadCount: number }>(
                `/notifications${qs ? `?${qs}` : ''}`
            );
        },
        markRead: (ids: string[]) =>
            request<{ success: boolean; unreadCount: number }>('/notifications/read', {
                method: 'POST',
                body: JSON.stringify({ ids }),
            }),
        markAllRead: () =>
            request<{ success: boolean; unreadCount: number }>('/notifications/read', {
                method: 'POST',
                body: JSON.stringify({ all: true }),
            }),
        delete: (id: string) =>
            request<{ success: boolean }>(`/notifications/${id}`, { method: 'DELETE' }),
    },

    // Task Templates
    templates: {
        getAll: () => request<TaskTemplate[]>('/templates'),
        create: (data: { name: string; description?: string; category?: string; xmlConfig: string }) =>
            request<TaskTemplate>('/templates', { method: 'POST', body: JSON.stringify(data) }),
        delete: (id: string) => request<{ success: boolean }>(`/templates/${id}`, { method: 'DELETE' }),
    },

    // IAA stats
    iaa: {
        getStats: (projectId: string, threshold?: number) =>
            request<IAAStats>(`/projects/${projectId}/iaa${threshold !== undefined ? `?threshold=${threshold}` : ''}`),
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
