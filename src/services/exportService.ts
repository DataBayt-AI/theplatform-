import { DataPoint } from "@/types/data";
import { getInterpolatedPrompt } from "@/utils/dataUtils";

export interface FieldConfig {
    core: true;
    split: boolean;              // train/validation/test split — standard HF field
    annotationMetadata: boolean; // annotatorName, annotatedAt, confidence
    aiData: boolean;             // aiSuggestions, originalAnnotation, humanAnnotation, ratings
    workflowInternal: boolean;   // assignments, annotationDrafts, isIAA, uploadPrompt, customField, customFieldName
    metadataColumns: boolean;    // dp.metadata spread (original CSV columns)
    customFieldValues: boolean;  // dp.customFieldValues spread
}

/**
 * Auto-selected fields optimised for HuggingFace dataset publishing.
 * Includes: humanAnnotation (raw annotator output), split, source CSV columns,
 * and annotation form outputs (customFieldValues). Excludes finalAnnotation
 * (platform-computed merge), AI drafts, assignment logs, and prompt templates.
 */
export const HF_FIELD_CONFIG: FieldConfig = {
    core: true,
    split: true,                // standard HF field — enables load_dataset(..., split="train")
    annotationMetadata: false,  // skip annotatorName, annotatedAt, confidence
    aiData: false,              // skip intermediate AI suggestions
    workflowInternal: false,    // skip workflow internals
    metadataColumns: true,      // original source CSV columns
    customFieldValues: true,    // annotation form outputs
};

const stripEmpty = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined || v === '') continue;
        if (Array.isArray(v) && v.length === 0) continue;
        if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
        out[k] = v;
    }
    return out;
};

export const exportService = {
    /**
     * Prepares data points for export by flattening structure and interpolating prompts.
     * When fieldConfig is provided, only selected field groups are included and empty values are stripped.
     */
    prepareData: (dataPoints: DataPoint[], fieldConfig?: FieldConfig) => {
        return dataPoints.map(dp => {
            // When using a field config (HF publish), core is humanAnnotation only
            // (the raw annotator output). customFieldValues carries structured form annotations.
            // Legacy export (no config) still starts with all four core fields below.
            const row: Record<string, unknown> = fieldConfig
                ? (dp.humanAnnotation ? { humanAnnotation: dp.humanAnnotation } : {})
                : { id: dp.id, content: dp.content, finalAnnotation: dp.finalAnnotation || '', status: dp.status };

            if (!fieldConfig) {
                // Legacy: include everything (used by JSON/CSV/JSONL download)
                Object.assign(row, {
                    ...(dp.metadata ?? {}),
                    uploadPrompt: getInterpolatedPrompt(dp.uploadPrompt || '', dp.metadata),
                    originalAnnotation: dp.originalAnnotation || '',
                    aiSuggestions: dp.aiSuggestions,
                    ratings: dp.ratings,
                    humanAnnotation: dp.humanAnnotation || '',
                    annotatorId: dp.annotatorId || '',
                    annotatorName: dp.annotatorName || '',
                    annotatedAt: dp.annotatedAt || '',
                    isIAA: dp.isIAA || false,
                    assignments: dp.assignments || [],
                    annotationDrafts: dp.annotationDrafts || {},
                    confidence: dp.confidence,
                    customField: dp.customField || '',
                    customFieldName: dp.customFieldName || '',
                    ...(dp.customFieldValues ?? {}),
                });
                return row;
            }

            // Selective export with empty-field stripping
            if (fieldConfig.metadataColumns && dp.metadata) {
                Object.assign(row, dp.metadata);
            }

            if (fieldConfig.split && dp.split) {
                row.split = dp.split;
            }

            if (fieldConfig.annotationMetadata) {
                if (dp.annotatorName) row.annotatorName = dp.annotatorName;
                if (dp.annotatedAt) row.annotatedAt = dp.annotatedAt;
                if (dp.confidence !== undefined) row.confidence = dp.confidence;
            }

            if (fieldConfig.aiData) {
                if (dp.aiSuggestions && Object.keys(dp.aiSuggestions).length > 0) row.aiSuggestions = dp.aiSuggestions;
                if (dp.originalAnnotation) row.originalAnnotation = dp.originalAnnotation;
                if (dp.humanAnnotation) row.humanAnnotation = dp.humanAnnotation;
                if (dp.ratings && Object.keys(dp.ratings).length > 0) row.ratings = dp.ratings;
            }

            if (fieldConfig.workflowInternal) {
                row.uploadPrompt = getInterpolatedPrompt(dp.uploadPrompt || '', dp.metadata);
                if (dp.assignments && dp.assignments.length > 0) row.assignments = dp.assignments;
                if (dp.annotationDrafts && Object.keys(dp.annotationDrafts).length > 0) row.annotationDrafts = dp.annotationDrafts;
                if (dp.isIAA) row.isIAA = dp.isIAA;
                if (dp.customField) row.customField = dp.customField;
                if (dp.customFieldName) row.customFieldName = dp.customFieldName;
            }

            if (fieldConfig.customFieldValues && dp.customFieldValues) {
                Object.assign(row, dp.customFieldValues);
            }

            return stripEmpty(row);
        });
    },

    /**
     * Triggers a browser download for a given blob.
     */
    downloadFile: (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },

    /**
     * Exports data as a JSON file.
     */
    exportAsJSON: (dataPoints: DataPoint[], projectName: string) => {
        const results = exportService.prepareData(dataPoints);
        const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
        const filename = `${projectName.replace(/\s+/g, '_')}_annotated.json`;
        exportService.downloadFile(blob, filename);
    },

    /**
     * Exports data as a CSV file.
     */
    exportAsCSV: (dataPoints: DataPoint[], projectName: string) => {
        const results = exportService.prepareData(dataPoints);
        if (results.length === 0) return;

        const allKeys = Array.from(new Set(results.flatMap(r => Object.keys(r))));
        const header = allKeys.join(',');
        const rows = results.map(row => {
            return allKeys.map(key => {
                const value = row[key];
                if (value === null || value === undefined) return '';
                if (typeof value === 'object') {
                    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                }
                const stringValue = String(value);
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            }).join(',');
        });

        const csvContent = [header, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const filename = `${projectName.replace(/\s+/g, '_')}_annotated.csv`;
        exportService.downloadFile(blob, filename);
    },

    /**
     * Exports data as a JSONL file (Hugging Face format).
     */
    exportAsJSONL: (dataPoints: DataPoint[], projectName: string) => {
        const results = exportService.prepareData(dataPoints);
        const jsonlContent = results.map(item => JSON.stringify(item)).join('\n');
        const blob = new Blob([jsonlContent], { type: 'application/x-ndjson' });
        const filename = `${projectName.replace(/\s+/g, '_')}_annotated.jsonl`;
        exportService.downloadFile(blob, filename);
    },

    /**
     * Generates a Blob for JSONL content (used for HF upload).
     * Accepts an optional FieldConfig to control which fields are included.
     */
    generateJSONLBlob: (dataPoints: DataPoint[], fieldConfig?: FieldConfig): Blob => {
        const results = exportService.prepareData(dataPoints, fieldConfig);
        const jsonlContent = results.map(item => JSON.stringify(item)).join('\n');
        return new Blob([jsonlContent], { type: 'application/x-ndjson' });
    }
};
