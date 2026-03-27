// XML Config Service - Parses annotation field configuration from XML

export interface FieldOption {
    value: string;
    label: string;
}

export interface RatingConfig {
    min: number;        // default 1
    max: number;        // default 5
    minLabel?: string;  // e.g. "Poor"
    maxLabel?: string;  // e.g. "Excellent"
    style: 'stars' | 'numbers';
}

export interface EntityTypeOption {
    value: string;
    label: string;
}

export interface FieldConfig {
    id: string;
    type: 'textarea' | 'text' | 'dropdown' | 'checkbox' | 'radio' | 'rating-scale' | 'entity-list';
    label: string;
    placeholder?: string;
    required?: boolean;
    options?: FieldOption[];           // dropdown / radio
    ratingConfig?: RatingConfig;       // rating-scale
    entityTypes?: EntityTypeOption[];      // entity-list
    entityConfidence?: boolean;           // entity-list: show per-entity confidence
    sourceField?: string;                 // entity-list: metadata column to use as source text
}

export interface AnnotationConfig {
    fields: FieldConfig[];
}

/**
 * Parse XML string into AnnotationConfig
 */
export function parseAnnotationConfigXML(xmlString: string): AnnotationConfig {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');

    // Check for parsing errors
    const parseError = doc.querySelector('parsererror');
    if (parseError) {
        throw new Error('Invalid XML: ' + parseError.textContent);
    }

    const fields: FieldConfig[] = [];
    const fieldElements = doc.querySelectorAll('annotation-config > field');

    fieldElements.forEach(fieldEl => {
        const id = fieldEl.getAttribute('id');
        const type = fieldEl.getAttribute('type') as FieldConfig['type'];
        const required = fieldEl.getAttribute('required') === 'true';

        if (!id || !type) {
            console.warn('Skipping field without id or type');
            return;
        }

        const labelEl = fieldEl.querySelector('label');
        const placeholderEl = fieldEl.querySelector('placeholder');

        const field: FieldConfig = {
            id,
            type,
            label: labelEl?.textContent || id,
            placeholder: placeholderEl?.textContent || undefined,
            required,
        };

        // Parse options for dropdown and radio types
        if (type === 'dropdown' || type === 'radio') {
            const optionEls = fieldEl.querySelectorAll('options > option');
            field.options = Array.from(optionEls).map(optEl => ({
                value: optEl.getAttribute('value') || optEl.textContent || '',
                label: optEl.textContent || optEl.getAttribute('value') || '',
            }));
        }

        // Parse entity types for entity-list type
        if (type === 'entity-list') {
            const typeEls = fieldEl.querySelectorAll('entity-types > type');
            field.entityTypes = Array.from(typeEls).map(el => ({
                value: el.getAttribute('value') || el.textContent || '',
                label: el.textContent || el.getAttribute('value') || '',
            }));
            field.entityConfidence = fieldEl.getAttribute('show-confidence') === 'true';
            const sourceField = fieldEl.getAttribute('source-field');
            if (sourceField) field.sourceField = sourceField;
        }

        // Parse rating config for rating-scale type
        if (type === 'rating-scale') {
            const ratingEl = fieldEl.querySelector('rating');
            field.ratingConfig = {
                min: parseInt(ratingEl?.getAttribute('min') || '1', 10),
                max: parseInt(ratingEl?.getAttribute('max') || '5', 10),
                minLabel: ratingEl?.getAttribute('min-label') || undefined,
                maxLabel: ratingEl?.getAttribute('max-label') || undefined,
                style: (ratingEl?.getAttribute('style') as 'stars' | 'numbers') || 'numbers',
            };
        }

        fields.push(field);
    });

    return { fields };
}

/**
 * Load default annotation config from public folder
 */
export async function loadDefaultAnnotationConfig(): Promise<AnnotationConfig> {
    const response = await fetch('/default-annotation-config.xml');
    if (!response.ok) {
        throw new Error('Failed to load default annotation config');
    }
    const xmlString = await response.text();
    return parseAnnotationConfigXML(xmlString);
}

/**
 * Load annotation config from a File object
 */
export async function loadAnnotationConfigFromFile(file: File): Promise<AnnotationConfig> {
    const xmlString = await file.text();
    return parseAnnotationConfigXML(xmlString);
}
