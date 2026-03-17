import { useState } from "react";
import { parseAnnotationConfigXML } from "@/services/xmlConfigService";
import DynamicAnnotationForm from "@/components/DynamicAnnotationForm";

interface AnnotationFormPreviewProps {
    xmlConfig: string;
    className?: string;
}

export function AnnotationFormPreview({ xmlConfig, className }: AnnotationFormPreviewProps) {
    const [values, setValues] = useState<Record<string, string | boolean>>({});

    if (!xmlConfig.trim()) {
        return (
            <div className={`flex items-center justify-center h-full min-h-[120px] rounded-md border border-dashed bg-muted/30 text-muted-foreground text-sm text-center p-6 ${className ?? ''}`}>
                Configure your form above to see a live preview.
            </div>
        );
    }

    let fields;
    let parseError: string | null = null;
    try {
        ({ fields } = parseAnnotationConfigXML(xmlConfig));
    } catch (err) {
        parseError = err instanceof Error ? err.message : 'Invalid XML';
    }

    if (parseError) {
        return (
            <div className={`rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive ${className ?? ''}`}>
                <p className="font-medium mb-1">XML Error</p>
                <p className="font-mono text-xs break-all">{parseError}</p>
            </div>
        );
    }

    if (!fields || fields.length === 0) {
        return (
            <div className={`flex items-center justify-center h-full min-h-[120px] rounded-md border border-dashed bg-muted/30 text-muted-foreground text-sm p-6 ${className ?? ''}`}>
                No fields defined yet.
            </div>
        );
    }

    return (
        <div className={`rounded-md border bg-background p-4 ${className ?? ''}`}>
            <DynamicAnnotationForm
                fields={fields}
                values={values}
                onChange={(id, val) => setValues(prev => ({ ...prev, [id]: val }))}
            />
        </div>
    );
}

export default AnnotationFormPreview;
