// XML Config Service - Parses annotation field configuration from XML

export interface FieldOption {
    value: string;
    label: string;
}

export interface FieldConfig {
    id: string;
    type: 'textarea' | 'text' | 'dropdown' | 'checkbox';
    label: string;
    placeholder?: string;
    required?: boolean;
    options?: FieldOption[]; // For dropdown type
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

        // Parse options for dropdown type
        if (type === 'dropdown') {
            const optionEls = fieldEl.querySelectorAll('options > option');
            field.options = Array.from(optionEls).map(optEl => ({
                value: optEl.getAttribute('value') || optEl.textContent || '',
                label: optEl.textContent || optEl.getAttribute('value') || '',
            }));
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
