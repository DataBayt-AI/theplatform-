import { DataPoint } from "@/types/data";
import { getInterpolatedPrompt } from "@/utils/dataUtils";

export const exportService = {
    /**
     * Prepares data points for export by flattening structure and interpolating prompts.
     */
    prepareData: (dataPoints: DataPoint[]) => {
        return dataPoints.map(dp => ({
            id: dp.id,
            content: dp.content,
            ...dp.metadata, // Include all original CSV columns
            uploadPrompt: getInterpolatedPrompt(dp.uploadPrompt || '', dp.metadata), // Include interpolated instructions
            originalAnnotation: dp.originalAnnotation || '',
            aiSuggestions: dp.aiSuggestions,
            ratings: dp.ratings,
            humanAnnotation: dp.humanAnnotation || '',
            finalAnnotation: dp.finalAnnotation || '',
            status: dp.status,
            confidence: dp.confidence,
            customField: dp.customField || '',
            customFieldName: dp.customFieldName || ''
        }));
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

        // Get all unique keys from all objects to ensure headers are complete
        const allKeys = Array.from(new Set(results.flatMap(Object.keys)));

        // Create CSV header
        const header = allKeys.join(',');

        // Create CSV rows
        const rows = results.map(row => {
            return allKeys.map(key => {
                const value = (row as any)[key];
                if (value === null || value === undefined) return '';

                // Handle objects (like aiSuggestions)
                if (typeof value === 'object') {
                    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
                }

                // Handle strings with special characters
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
        const blob = new Blob([jsonlContent], { type: 'application/json' });
        const filename = `${projectName.replace(/\s+/g, '_')}_annotated.jsonl`;
        exportService.downloadFile(blob, filename);
    },

    /**
     * Generates a Blob for JSONL content (used for HF upload).
     */
    generateJSONLBlob: (dataPoints: DataPoint[]): Blob => {
        const results = exportService.prepareData(dataPoints);
        const jsonlContent = results.map(item => JSON.stringify(item)).join('\n');
        return new Blob([jsonlContent], { type: 'application/json' });
    }
};
