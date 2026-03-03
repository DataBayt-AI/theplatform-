import { exportService, FieldConfig } from '@/services/exportService';
import type { DataPoint } from '@/types/data';

self.onmessage = async (e: MessageEvent<{ dataPoints: DataPoint[]; fieldConfig: FieldConfig }>) => {
    const { dataPoints, fieldConfig } = e.data;
    const blob = exportService.generateJSONLBlob(dataPoints, fieldConfig);
    const buffer = await blob.arrayBuffer();
    // Transfer the ArrayBuffer to the main thread without copying (zero-copy)
    (self as unknown as Worker).postMessage({ buffer, mimeType: blob.type }, [buffer]);
};
