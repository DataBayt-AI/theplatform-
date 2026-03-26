import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Star, Plus, X } from "lucide-react";
import { FieldConfig } from "@/services/xmlConfigService";
import { NERAnnotator, NEREntity } from "@/components/NERAnnotator";

interface DynamicAnnotationFormProps {
    fields: FieldConfig[];
    values: Record<string, string | boolean>;
    onChange: (fieldId: string, value: string | boolean) => void;
    metadata?: Record<string, string>; // Data from current data point
    sourceText?: string; // Source text for NER annotation fields
}

// Interpolate {{columnName}} with actual values from metadata
const interpolate = (text: string | undefined, metadata?: Record<string, string>): string => {
    if (!text || !metadata) return text || '';
    let result = text;
    Object.entries(metadata).forEach(([key, value]) => {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp(`\\{\\{${escapedKey}\\}\\}`, 'g'), value);
    });
    return result;
};

export const DynamicAnnotationForm = ({ fields, values, onChange, metadata, sourceText }: DynamicAnnotationFormProps) => {
    const { t } = useTranslation();
    return (
        <div className="space-y-4">
            {fields.map((field) => (
                <div key={field.id} className="space-y-2">
                    <Label htmlFor={field.id}>
                        {interpolate(field.label, metadata)}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                    </Label>

                    {field.type === 'textarea' && (
                        <Textarea
                            id={field.id}
                            placeholder={interpolate(field.placeholder, metadata)}
                            value={(values[field.id] as string) || ''}
                            onChange={(e) => onChange(field.id, e.target.value)}
                            rows={3}
                        />
                    )}

                    {field.type === 'text' && (
                        <Input
                            id={field.id}
                            type="text"
                            placeholder={interpolate(field.placeholder, metadata)}
                            value={(values[field.id] as string) || ''}
                            onChange={(e) => onChange(field.id, e.target.value)}
                        />
                    )}

                    {field.type === 'dropdown' && field.options && (
                        <Select
                            value={(values[field.id] as string) || ''}
                            onValueChange={(value) => onChange(field.id, value)}
                        >
                            <SelectTrigger id={field.id}>
                                <SelectValue placeholder={interpolate(field.placeholder, metadata) || 'Select...'} />
                            </SelectTrigger>
                            <SelectContent>
                                {field.options.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {field.type === 'checkbox' && (
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id={field.id}
                                checked={(values[field.id] as boolean) || false}
                                onCheckedChange={(checked) => onChange(field.id, !!checked)}
                            />
                            <label htmlFor={field.id} className="text-sm cursor-pointer">
                                {interpolate(field.placeholder, metadata) || interpolate(field.label, metadata)}
                            </label>
                        </div>
                    )}

                    {field.type === 'radio' && field.options && (
                        <RadioGroup
                            value={(values[field.id] as string) || ''}
                            onValueChange={(value) => onChange(field.id, value)}
                            className="flex flex-wrap gap-4"
                        >
                            {field.options.map((option) => (
                                <div key={option.value} className="flex items-center space-x-2">
                                    <RadioGroupItem value={option.value} id={`${field.id}-${option.value}`} />
                                    <label htmlFor={`${field.id}-${option.value}`} className="text-sm cursor-pointer">
                                        {option.label}
                                    </label>
                                </div>
                            ))}
                        </RadioGroup>
                    )}

                    {field.type === 'entity-list' && field.entityTypes && (() => {
                        let entities: NEREntity[] = [];
                        try { entities = JSON.parse((values[field.id] as string) || '[]'); } catch { entities = []; }

                        // Resolve source text: field.sourceField → metadata column, else prop
                        const resolvedText = field.sourceField && metadata?.[field.sourceField]
                            ? metadata[field.sourceField]
                            : sourceText || '';

                        return (
                            <NERAnnotator
                                sourceText={resolvedText}
                                entities={entities}
                                onEntitiesChange={(next) => onChange(field.id, JSON.stringify(next))}
                                entityTypes={field.entityTypes}
                                showConfidence={field.entityConfidence}
                            />
                        );
                    })()}

                    {field.type === 'rating-scale' && field.ratingConfig && (() => {
                        const { min, max, minLabel, maxLabel, style } = field.ratingConfig;
                        const current = parseInt((values[field.id] as string) || '0', 10);
                        const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
                        return (
                            <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                    {steps.map((val) =>
                                        style === 'stars' ? (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() => onChange(field.id, String(val))}
                                                className="p-0.5 rounded transition-colors hover:scale-110"
                                                aria-label={`Rate ${val}`}
                                            >
                                                <Star
                                                    className={`w-6 h-6 transition-colors ${val <= current ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
                                                />
                                            </button>
                                        ) : (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() => onChange(field.id, String(val))}
                                                className={`w-9 h-9 rounded-md text-sm font-medium border transition-colors ${val === current ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`}
                                            >
                                                {val}
                                            </button>
                                        )
                                    )}
                                </div>
                                {(minLabel || maxLabel) && (
                                    <div className="flex justify-between text-xs text-muted-foreground px-0.5">
                                        <span>{minLabel}</span>
                                        <span>{maxLabel}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            ))}
        </div>
    );
};

export default DynamicAnnotationForm;
