export interface DataPoint {
    id: string;
    content: string;
    type?: 'text' | 'image'; // Defaults to 'text' if undefined
    originalAnnotation?: string;
    humanAnnotation?: string;
    finalAnnotation?: string;
    aiSuggestions: Record<string, string>; // providerId -> suggestion
    ratings: Record<string, number>; // providerId -> rating (1-5)
    status: 'pending' | 'ai_processed' | 'accepted' | 'edited' | 'rejected' | 'partial' | 'needs_adjudication';
    confidence?: number;
    uploadPrompt?: string; // Prompt used during upload
    customField?: string; // Value of the custom field
    customFieldName?: string; // Name of the custom field
    metadata?: Record<string, string>; // All metadata from original file
    displayMetadata?: Record<string, string>; // User-selected columns to display in sidebar
    customFieldValues?: Record<string, string | boolean>; // Values from XML annotation form
    split?: 'train' | 'validation' | 'test';
    annotatorId?: string;
    annotatorName?: string;
    annotatedAt?: number;
    isIAA?: boolean;
    iaaRequiredCount?: number;
    assignments?: AnnotationAssignment[];
    annotationDrafts?: Record<string, string>;
}

export interface AnnotationAssignment {
    annotatorId: string;
    status: 'pending' | 'in_progress' | 'done';
    value?: string;
    annotatedAt?: number;
}

export interface ProjectIAAConfig {
    enabled: boolean;
    portionPercent: number;
    annotatorsPerIAAItem: number;
    seed?: number;
}

export interface ProjectSnapshot {
    id: string;
    projectId: string;
    name: string; // e.g. "v1.0", "Before auto-labeling"
    description?: string;
    createdAt: number;
    dataPoints: DataPoint[];
    stats: AnnotationStats;
}

export interface AIModel {
    id: string;
    name: string;
    description?: string;
}

export interface ModelProvider {
    id: string;
    name: string;
    description: string;
    requiresApiKey: boolean;
    models: AIModel[];
}

export interface ProviderConnection {
    id: string;
    providerId: ModelProvider['id'];
    name: string;
    apiKey?: string;
    baseUrl?: string;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface ModelProfile {
    id: string;
    providerConnectionId: string;
    modelId: AIModel['id'];
    displayName: string;
    defaultPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    inputPricePerMillion?: number;
    outputPricePerMillion?: number;
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface ProjectModelPolicy {
    projectId: string;
    allowedModelProfileIds: string[];
    defaultModelProfileIds: string[];
    updatedAt: number;
}

export interface AnnotationStats {
    totalAccepted: number;
    totalRejected: number;
    totalEdited: number;
    totalProcessed: number;
    averageConfidence: number;
    sessionTime: number;
}

export interface Project {
    id: string;
    name: string;
    description?: string;
    guidelines?: string;
    managerId?: string | null;
    annotatorIds?: string[];
    xmlConfig?: string;
    uploadPrompt?: string;
    customFieldName?: string;
    auditLog?: ProjectAuditEntry[];
    iaaConfig?: ProjectIAAConfig;
    createdAt: number;
    updatedAt: number;
    dataPoints: DataPoint[];
    totalDataPoints?: number; // Total number of data points (useful when dataPoints is empty in list view)
    stats: AnnotationStats;
}

export interface ProjectAuditEntry {
    id: string;
    timestamp: number;
    actorId?: string;
    actorName?: string;
    action: 'upload' | 'ai_process' | 'export' | 'assign';
    details?: string;
}
