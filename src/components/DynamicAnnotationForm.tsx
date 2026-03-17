import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Star, Plus, X } from "lucide-react";
import { FieldConfig } from "@/services/xmlConfigService";

interface DynamicAnnotationFormProps {
    fields: FieldConfig[];
    values: Record<string, string | boolean>;
    onChange: (fieldId: string, value: string | boolean) => void;
    metadata?: Record<string, string>; // Data from current data point
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

export const DynamicAnnotationForm = ({ fields, values, onChange, metadata }: DynamicAnnotationFormProps) => {
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
                        type Entity = { text: string; type: string; confidence?: number };
                        let entities: Entity[] = [];
                        try { entities = JSON.parse((values[field.id] as string) || '[]'); } catch { entities = []; }

                        const updateEntities = (next: Entity[]) =>
                            onChange(field.id, JSON.stringify(next));

                        const defaultType = field.entityTypes[0]?.value ?? '';
                        const showConf = field.entityConfidence ?? false;
                        const CONF_LABELS = ['', 'Low', 'Med', 'High'];

                        return (
                            <div className="space-y-2">
                                {entities.length === 0 && (
                                    <p className="text-xs text-muted-foreground italic">No entities added yet.</p>
                                )}
                                {entities.map((ent, i) => (
                                    <div key={i} className="flex items-center gap-2 flex-wrap">
                                        <Input
                                            value={ent.text}
                                            onChange={e => {
                                                const next = [...entities];
                                                next[i] = { ...next[i], text: e.target.value };
                                                updateEntities(next);
                                            }}
                                            placeholder={interpolate(field.placeholder, metadata) || 'Entity text…'}
                                            className="flex-1 min-w-32 h-8 text-sm"
                                        />
                                        <Select
                                            value={ent.type}
                                            onValueChange={val => {
                                                const next = [...entities];
                                                next[i] = { ...next[i], type: val };
                                                updateEntities(next);
                                            }}
                                        >
                                            <SelectTrigger className="w-36 h-8 text-xs shrink-0">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {field.entityTypes!.map(et => (
                                                    <SelectItem key={et.value} value={et.value} className="text-xs">
                                                        {et.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {showConf && (
                                            <div className="flex items-center gap-0.5 shrink-0" title="Confidence">
                                                {[1, 2, 3].map(lvl => (
                                                    <button
                                                        key={lvl}
                                                        type="button"
                                                        onClick={() => {
                                                            const next = [...entities];
                                                            next[i] = { ...next[i], confidence: ent.confidence === lvl ? undefined : lvl };
                                                            updateEntities(next);
                                                        }}
                                                        title={CONF_LABELS[lvl]}
                                                        className={`w-6 h-6 rounded text-xs font-medium border transition-colors ${
                                                            ent.confidence === lvl
                                                                ? 'bg-primary text-primary-foreground border-primary'
                                                                : 'border-input hover:bg-muted text-muted-foreground'
                                                        }`}
                                                    >
                                                        {lvl}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => updateEntities(entities.filter((_, j) => j !== i))}
                                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                            aria-label="Remove entity"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => updateEntities([...entities, { text: '', type: defaultType }])}
                                >
                                    <Plus className="w-3 h-3" />
                                    Add entity
                                </Button>
                            </div>
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
