import type { AnnotationSchema, AnnotationResult, AnnotationSpan } from '@/types/data';
import type { FieldConfig } from '@/services/xmlConfigService';

// ── Shared helpers ─────────────────────────────────────────────────────────

const buildLabelSchema = (labels?: string[]): Record<string, unknown> =>
    labels && labels.length > 0 ? { type: 'string', enum: labels } : { type: 'string' };

/** Maps a FieldConfig.type to the AnnotationSchema field type used in JSON Schema generation. */
export function mapFieldConfigType(type: FieldConfig['type']): 'boolean' | 'choice' | 'number' | 'string' {
    switch (type) {
        case 'checkbox':     return 'boolean';
        case 'radio':
        case 'dropdown':     return 'choice';
        case 'rating-scale': return 'number';
        default:             return 'string';
    }
}

// ── JSON Schema generation ─────────────────────────────────────────────────

export function toJsonSchema(schema: AnnotationSchema): Record<string, unknown> {
    switch (schema.taskType) {
        case 'text_classification':
        case 'image_classification':
            return {
                type: 'object',
                properties: {
                    label: buildLabelSchema(schema.labels),
                    confidence: { type: 'number', minimum: 0, maximum: 1 }
                },
                required: ['label'],
                additionalProperties: false
            };

        case 'sequence_labeling': {
            return {
                type: 'object',
                properties: {
                    spans: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                start: { type: 'integer', minimum: 0 },
                                end:   { type: 'integer', minimum: 0 },
                                label: buildLabelSchema(schema.labels),
                                text:  { type: 'string' }
                            },
                            required: ['start', 'end', 'label', 'text'],
                            additionalProperties: false
                        }
                    }
                },
                required: ['spans'],
                additionalProperties: false
            };
        }

        case 'text_generation':
            return {
                type: 'object',
                properties: { text: { type: 'string' } },
                required: ['text'],
                additionalProperties: false
            };

        case 'audio_transcription':
            return {
                type: 'object',
                properties: { transcription: { type: 'string' } },
                required: ['transcription'],
                additionalProperties: false
            };

        case 'custom': {
            if (!schema.fields || schema.fields.length === 0) {
                return { type: 'object', additionalProperties: true };
            }
            const properties: Record<string, unknown> = {};
            const required: string[] = [];
            for (const field of schema.fields) {
                if (field.type === 'choice' && field.options && field.options.length > 0) {
                    properties[field.name] = { type: 'string', enum: field.options };
                } else if (field.type === 'boolean') {
                    properties[field.name] = { type: 'boolean' };
                } else if (field.type === 'number') {
                    properties[field.name] = { type: 'number' };
                } else {
                    properties[field.name] = { type: 'string' };
                }
                if (field.required !== false) required.push(field.name);
            }
            return { type: 'object', properties, required, additionalProperties: false };
        }

        default:
            return { type: 'object', additionalProperties: true };
    }
}

// ── Anthropic tool definition ──────────────────────────────────────────────

export function toAnthropicTool(schema: AnnotationSchema): Record<string, unknown> {
    return {
        name: 'submit_annotation',
        description: `Submit the structured annotation result for a ${schema.taskType} task.`,
        input_schema: toJsonSchema(schema)
    };
}

// ── Gemini response_schema (strips additionalProperties — not supported) ───

export function toGeminiSchema(schema: AnnotationSchema): Record<string, unknown> {
    return stripAdditionalProperties(toJsonSchema(schema));
}

function stripAdditionalProperties(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (key === 'additionalProperties') continue;
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = stripAdditionalProperties(value as Record<string, unknown>);
        } else if (Array.isArray(value)) {
            result[key] = value.map(item =>
                item && typeof item === 'object'
                    ? stripAdditionalProperties(item as Record<string, unknown>)
                    : item
            );
        } else {
            result[key] = value;
        }
    }
    return result;
}

// ── Prompt instruction for Tier 3 providers ───────────────────────────────

export function buildSchemaPrompt(schema: AnnotationSchema, attempt = 0, precomputedSchemaStr?: string): string {
    const schemaStr = precomputedSchemaStr ?? JSON.stringify(toJsonSchema(schema), null, 2);
    const strictening =
        attempt === 0 ? '' :
        attempt === 1 ? '\nIMPORTANT: Your previous response was not valid JSON. Output ONLY the JSON object, nothing else — no markdown, no explanation.' :
                        '\nCRITICAL: Output ONLY raw JSON starting with { and ending with }. Absolutely no other text.';
    return `You must respond with a JSON object that exactly matches this schema:\n${schemaStr}${strictening}`;
}

// ── Response parsing ───────────────────────────────────────────────────────

export function parseAnnotationResponse(raw: string, schema: AnnotationSchema): AnnotationResult | null {
    let cleaned = raw.trim();

    // Strip markdown code fences
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        // Try extracting first {...} block
        const objMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!objMatch) return null;
        try {
            parsed = JSON.parse(objMatch[0]);
        } catch {
            return null;
        }
    }

    return normalizeResult(parsed, schema, raw);
}

function normalizeResult(
    parsed: Record<string, unknown>,
    schema: AnnotationSchema,
    raw: string
): AnnotationResult {
    const result: AnnotationResult = { taskType: schema.taskType, raw };

    switch (schema.taskType) {
        case 'text_classification':
        case 'image_classification':
            if (typeof parsed.label === 'string') result.label = parsed.label;
            if (typeof parsed.confidence === 'number') result.confidence = parsed.confidence;
            break;

        case 'sequence_labeling':
            result.spans = Array.isArray(parsed.spans)
                ? (parsed.spans as Record<string, unknown>[])
                    .filter(s => s && typeof s.label === 'string')
                    .map(s => ({
                        start: Number(s.start) || 0,
                        end:   Number(s.end)   || 0,
                        label: String(s.label),
                        text:  String(s.text ?? '')
                    } satisfies AnnotationSpan))
                : [];
            break;

        case 'text_generation':
            if (typeof parsed.text === 'string') result.text = parsed.text;
            break;

        case 'audio_transcription':
            if (typeof parsed.transcription === 'string') result.text = parsed.transcription;
            break;

        case 'custom':
            result.fields = {};
            if (schema.fields) {
                for (const field of schema.fields) {
                    const v = parsed[field.name];
                    if (v !== undefined && v !== null) {
                        result.fields[field.name] = v as string | boolean | number;
                    }
                }
            }
            break;
    }

    return result;
}

