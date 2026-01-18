export interface DataPoint {
    id: string;
    content: string;
    type?: 'text' | 'image'; // Defaults to 'text' if undefined
    originalAnnotation?: string;
    humanAnnotation?: string;
    finalAnnotation?: string;
    aiSuggestions: Record<string, string>; // providerId -> suggestion
    ratings: Record<string, number>; // providerId -> rating (1-5)
    status: 'pending' | 'ai_processed' | 'accepted' | 'edited' | 'rejected';
    confidence?: number;
    uploadPrompt?: string; // Prompt used during upload
    customField?: string; // Value of the custom field
    customFieldName?: string; // Name of the custom field
    metadata?: Record<string, string>; // All metadata from original file
    displayMetadata?: Record<string, string>; // User-selected columns to display in sidebar
    customFieldValues?: Record<string, string | boolean>; // Values from XML annotation form
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
    createdAt: number;
    updatedAt: number;
    dataPoints: DataPoint[];
    stats: AnnotationStats;
}
