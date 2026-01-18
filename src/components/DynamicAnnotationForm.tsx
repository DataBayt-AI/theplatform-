import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
                </div>
            ))}
        </div>
    );
};

export default DynamicAnnotationForm;
