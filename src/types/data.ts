export interface DataPoint {
    id: string;
    content: string;
    type?: 'text' | 'image' | 'audio'; // Defaults to 'text' if undefined
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

export interface ProjectDataStatusCounts {
    total: number;
    completed: number;
    remaining: number;
    accepted: number;
    edited: number;
    pending: number;
    aiProcessed: number;
    rejected: number;
}

export type TaskType =
    | 'text_classification'
    | 'sequence_labeling'
    | 'text_generation'
    | 'image_classification'
    | 'audio_transcription'
    | 'custom';

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
    text_classification: 'Text Classification',
    sequence_labeling: 'Sequence Labeling (NER)',
    text_generation: 'Text Generation / Translation',
    image_classification: 'Image Classification',
    audio_transcription: 'Audio Transcription',
    custom: 'Custom Form',
};

export interface Project {
    id: string;
    name: string;
    description?: string;
    guidelines?: string;
    managerId?: string | null;
    annotatorIds?: string[];
    taskType?: TaskType;
    xmlConfig?: string;
    uploadPrompt?: string;
    customFieldName?: string;
    auditLog?: ProjectAuditEntry[];
    iaaConfig?: ProjectIAAConfig;
    isDemo?: boolean;
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

export interface DataPointComment {
    id: string;
    projectId: string;
    dataPointId: string;
    authorId: string;
    authorName: string;
    body: string;
    parentCommentId?: string | null;
    createdAt: number;
    updatedAt: number;
    deletedAt?: number | null;
    isEdited: boolean;
}

export interface AnnotatorQualityStats {
    annotatorId: string;
    annotatorName: string;
    totalAnnotated: number;
    speedPerHour: number;
    editRate: number;
    rejectionRate: number;
    agreementRate: number | null;
    firstAnnotatedAt: number | null;
    lastAnnotatedAt: number | null;
}

export interface IAAItemScore {
    dataPointId: string;
    contentPreview: string;
    annotatorCount: number;
    agreementScore: number;    // 0–1
    annotations: Array<{ annotatorId: string; annotatorName: string; value: string }>;
    isLowAgreement: boolean;
}

export interface IAAStats {
    projectId: string;
    threshold: number;
    overallScore: number | null;
    totalIAAItems: number;
    itemsWithEnoughAnnotations: number;
    lowAgreementCount: number;
    items: IAAItemScore[];
}


export interface TaskTemplate {
    id: string;
    name: string;
    description?: string;
    category: string;
    xmlConfig: string;
    isGlobal: boolean;
    createdBy?: string;
    createdAt: number;
}

export interface AnnotatorStatsResponse {
    projectId: string;
    annotators: AnnotatorQualityStats[];
    summary: {
        totalAnnotators: number;
        avgSpeedPerHour: number;
        avgEditRate: number;
        avgRejectionRate: number;
        avgAgreementRate: number | null;
    };
}
