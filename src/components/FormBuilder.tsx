import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { parseAnnotationConfigXML, type FieldConfig } from "@/services/xmlConfigService";
import { serializeAnnotationConfigXML, createDefaultField, labelToId } from "@/services/xmlConfigSerializer";

interface FormBuilderProps {
    xmlConfig: string;
    onChange: (xml: string) => void;
    className?: string;
}

const FIELD_TYPE_LABELS: Record<FieldConfig['type'], string> = {
    text: 'Text',
    textarea: 'Long Text',
    dropdown: 'Dropdown',
    radio: 'Radio',
    checkbox: 'Checkbox',
    'rating-scale': 'Rating',
    'entity-list': 'Entity List',
};

const FIELD_TYPE_COLORS: Record<FieldConfig['type'], string> = {
    text: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    textarea: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    dropdown: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    radio: 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
    checkbox: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
    'rating-scale': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    'entity-list': 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
};

export function FormBuilder({ xmlConfig, onChange, className }: FormBuilderProps) {
    const [fields, setFields] = useState<FieldConfig[]>([]);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [parseError, setParseError] = useState<string>('');
    const lastSerializedRef = useRef<string>('');

    // Parse incoming xmlConfig → internal state (avoid loop with ref guard)
    useEffect(() => {
        if (xmlConfig === lastSerializedRef.current) return;
        if (!xmlConfig.trim()) {
            setFields([]);
            setParseError('');
            return;
        }
        try {
            const { fields: parsed } = parseAnnotationConfigXML(xmlConfig);
            setFields(parsed);
            setParseError('');
        } catch (err) {
            setParseError(err instanceof Error ? err.message : 'Invalid XML');
        }
    }, [xmlConfig]);

    const emit = useCallback((newFields: FieldConfig[]) => {
        const xml = serializeAnnotationConfigXML({ fields: newFields });
        lastSerializedRef.current = xml;
        onChange(xml);
    }, [onChange]);

    const updateField = (index: number, patch: Partial<FieldConfig>) => {
        setFields(prev => {
            const next = prev.map((f, i) => i === index ? { ...f, ...patch } as FieldConfig : f);
            emit(next);
            return next;
        });
    };

    const addField = (type: FieldConfig['type']) => {
        setFields(prev => {
            const ids = new Set(prev.map(f => f.id));
            const newField = createDefaultField(type, ids);
            const next = [...prev, newField];
            emit(next);
            setEditingIndex(next.length - 1);
            return next;
        });
    };

    const removeField = (index: number) => {
        setFields(prev => {
            const next = prev.filter((_, i) => i !== index);
            emit(next);
            if (editingIndex === index) setEditingIndex(null);
            else if (editingIndex !== null && editingIndex > index) setEditingIndex(editingIndex - 1);
            return next;
        });
    };

    const moveField = (index: number, dir: -1 | 1) => {
        const target = index + dir;
        if (target < 0 || target >= fields.length) return;
        setFields(prev => {
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            emit(next);
            if (editingIndex === index) setEditingIndex(target);
            return next;
        });
    };

    // Entity-type helpers
    const addEntityType = (fieldIndex: number) => {
        const ets = fields[fieldIndex].entityTypes ?? [];
        updateField(fieldIndex, {
            entityTypes: [...ets, { value: `type_${ets.length + 1}`, label: `Type ${ets.length + 1}` }],
        });
    };

    const updateEntityType = (fieldIndex: number, etIndex: number, key: 'value' | 'label', val: string) => {
        const ets = [...(fields[fieldIndex].entityTypes ?? [])];
        ets[etIndex] = { ...ets[etIndex], [key]: val };
        updateField(fieldIndex, { entityTypes: ets });
    };

    const removeEntityType = (fieldIndex: number, etIndex: number) => {
        updateField(fieldIndex, {
            entityTypes: (fields[fieldIndex].entityTypes ?? []).filter((_, i) => i !== etIndex),
        });
    };

    // Option helpers
    const addOption = (fieldIndex: number) => {
        const field = fields[fieldIndex];
        const opts = field.options ?? [];
        const n = opts.length + 1;
        updateField(fieldIndex, {
            options: [...opts, { value: `option_${n}`, label: `Option ${n}` }],
        });
    };

    const updateOption = (fieldIndex: number, optIndex: number, key: 'value' | 'label', val: string) => {
        const opts = [...(fields[fieldIndex].options ?? [])];
        opts[optIndex] = { ...opts[optIndex], [key]: val };
        updateField(fieldIndex, { options: opts });
    };

    const removeOption = (fieldIndex: number, optIndex: number) => {
        const opts = (fields[fieldIndex].options ?? []).filter((_, i) => i !== optIndex);
        updateField(fieldIndex, { options: opts });
    };

    // Rename id safely when label changes
    const handleLabelChange = (index: number, newLabel: string) => {
        const existingIds = new Set(fields.map((f, i) => i === index ? '' : f.id));
        const newId = labelToId(newLabel || 'field', existingIds);
        updateField(index, { label: newLabel, id: newId });
    };

    if (parseError) {
        return (
            <div className={`rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive ${className ?? ''}`}>
                <p className="font-medium mb-1">Cannot open Visual Builder — XML is invalid</p>
                <p className="font-mono text-xs break-all">{parseError}</p>
                <p className="mt-2 text-muted-foreground">Switch to "XML" mode to fix the error first.</p>
            </div>
        );
    }

    return (
        <div className={`space-y-3 ${className ?? ''}`}>
            {/* Field list */}
            {fields.length === 0 ? (
                <div className="flex items-center justify-center h-24 rounded-md border border-dashed bg-muted/30 text-muted-foreground text-sm">
                    No fields yet — add one below.
                </div>
            ) : (
                <div className="space-y-2">
                    {fields.map((field, index) => (
                        <div key={field.id} className="rounded-lg border bg-card overflow-hidden">
                            {/* Row header */}
                            <div className="flex items-center gap-2 px-3 py-2">
                                <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${FIELD_TYPE_COLORS[field.type]}`}>
                                    {FIELD_TYPE_LABELS[field.type]}
                                </span>
                                <span className="text-sm font-medium truncate flex-1">{field.label || <span className="text-muted-foreground italic">Untitled</span>}</span>
                                {field.required && <span className="text-xs text-red-500 shrink-0">required</span>}
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={() => moveField(index, -1)} disabled={index === 0} className="p-1 rounded hover:bg-muted disabled:opacity-30" aria-label="Move up"><ChevronUp className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30" aria-label="Move down"><ChevronDown className="w-3.5 h-3.5" /></button>
                                    <button
                                        onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                                        className={`p-1 rounded hover:bg-muted ${editingIndex === index ? 'bg-muted text-primary' : ''}`}
                                        aria-label="Edit field"
                                    >
                                        <Settings2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => removeField(index)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" aria-label="Remove field"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>

                            {/* Inline editor panel */}
                            {editingIndex === index && (
                                <div className="border-t px-3 py-3 bg-muted/20 space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label className="text-xs">Label *</Label>
                                            <Input
                                                value={field.label}
                                                onChange={e => handleLabelChange(index, e.target.value)}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-xs">Field ID</Label>
                                            <Input
                                                value={field.id}
                                                onChange={e => updateField(index, { id: e.target.value })}
                                                className="h-8 text-sm font-mono"
                                            />
                                        </div>
                                    </div>
                                    {(field.type !== 'checkbox' && field.type !== 'rating-scale' && field.type !== 'entity-list') && (
                                        <div className="space-y-1">
                                            <Label className="text-xs">Placeholder</Label>
                                            <Input
                                                value={field.placeholder ?? ''}
                                                onChange={e => updateField(index, { placeholder: e.target.value || undefined })}
                                                className="h-8 text-sm"
                                            />
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <Checkbox
                                            id={`req-${field.id}`}
                                            checked={!!field.required}
                                            onCheckedChange={v => updateField(index, { required: !!v })}
                                        />
                                        <label htmlFor={`req-${field.id}`} className="text-xs cursor-pointer">Required</label>
                                    </div>

                                    {/* Options editor for dropdown / radio */}
                                    {(field.type === 'dropdown' || field.type === 'radio') && (
                                        <div className="space-y-2">
                                            <Label className="text-xs">Options</Label>
                                            {(field.options ?? []).map((opt, oi) => (
                                                <div key={oi} className="flex items-center gap-2">
                                                    <Input
                                                        value={opt.label}
                                                        onChange={e => updateOption(index, oi, 'label', e.target.value)}
                                                        placeholder="Label"
                                                        className="h-7 text-xs flex-1"
                                                    />
                                                    <Input
                                                        value={opt.value}
                                                        onChange={e => updateOption(index, oi, 'value', e.target.value)}
                                                        placeholder="Value"
                                                        className="h-7 text-xs w-28 font-mono"
                                                    />
                                                    <button onClick={() => removeOption(index, oi)} className="text-muted-foreground hover:text-destructive" aria-label="Remove option">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addOption(index)}>
                                                <Plus className="w-3 h-3 mr-1" /> Add Option
                                            </Button>
                                        </div>
                                    )}

                                    {/* Entity types editor */}
                                    {field.type === 'entity-list' && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    id={`conf-${field.id}`}
                                                    checked={!!field.entityConfidence}
                                                    onCheckedChange={v => updateField(index, { entityConfidence: !!v })}
                                                />
                                                <label htmlFor={`conf-${field.id}`} className="text-xs cursor-pointer">Show per-entity confidence (1–3)</label>
                                            </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs">Entity Types</Label>
                                            {(field.entityTypes ?? []).map((et, ei) => (
                                                <div key={ei} className="flex items-center gap-2">
                                                    <Input
                                                        value={et.label}
                                                        onChange={e => updateEntityType(index, ei, 'label', e.target.value)}
                                                        placeholder="Label"
                                                        className="h-7 text-xs flex-1"
                                                    />
                                                    <Input
                                                        value={et.value}
                                                        onChange={e => updateEntityType(index, ei, 'value', e.target.value)}
                                                        placeholder="Value"
                                                        className="h-7 text-xs w-20 font-mono"
                                                    />
                                                    <button onClick={() => removeEntityType(index, ei)} className="text-muted-foreground hover:text-destructive" aria-label="Remove type">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => addEntityType(index)}>
                                                <Plus className="w-3 h-3 mr-1" /> Add Type
                                            </Button>
                                        </div>
                                        </div>
                                    )}

                                    {/* Rating config editor */}
                                    {field.type === 'rating-scale' && field.ratingConfig && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-xs">Min</Label>
                                                <Input
                                                    type="number"
                                                    value={field.ratingConfig.min}
                                                    onChange={e => updateField(index, { ratingConfig: { ...field.ratingConfig!, min: parseInt(e.target.value) || 1 } })}
                                                    className="h-7 text-xs"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Max</Label>
                                                <Input
                                                    type="number"
                                                    value={field.ratingConfig.max}
                                                    onChange={e => updateField(index, { ratingConfig: { ...field.ratingConfig!, max: parseInt(e.target.value) || 5 } })}
                                                    className="h-7 text-xs"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Min Label</Label>
                                                <Input
                                                    value={field.ratingConfig.minLabel ?? ''}
                                                    onChange={e => updateField(index, { ratingConfig: { ...field.ratingConfig!, minLabel: e.target.value || undefined } })}
                                                    className="h-7 text-xs"
                                                    placeholder="e.g. Poor"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">Max Label</Label>
                                                <Input
                                                    value={field.ratingConfig.maxLabel ?? ''}
                                                    onChange={e => updateField(index, { ratingConfig: { ...field.ratingConfig!, maxLabel: e.target.value || undefined } })}
                                                    className="h-7 text-xs"
                                                    placeholder="e.g. Excellent"
                                                />
                                            </div>
                                            <div className="col-span-2 space-y-1">
                                                <Label className="text-xs">Style</Label>
                                                <Select
                                                    value={field.ratingConfig.style}
                                                    onValueChange={v => updateField(index, { ratingConfig: { ...field.ratingConfig!, style: v as 'stars' | 'numbers' } })}
                                                >
                                                    <SelectTrigger className="h-7 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="numbers">Numbers</SelectItem>
                                                        <SelectItem value="stars">Stars</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Add field row */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground mr-1">Add:</span>
                {(Object.keys(FIELD_TYPE_LABELS) as FieldConfig['type'][]).map(type => (
                    <Button
                        key={type}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => addField(type)}
                    >
                        <Plus className="w-3 h-3" />
                        {FIELD_TYPE_LABELS[type]}
                    </Button>
                ))}
            </div>
        </div>
    );
}

export default FormBuilder;
