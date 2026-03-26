import type { AnnotationConfig, FieldConfig } from "./xmlConfigService";

/**
 * Serialize an AnnotationConfig back to an XML string.
 * This is the exact inverse of parseAnnotationConfigXML.
 */
export function serializeAnnotationConfigXML(config: AnnotationConfig): string {
    const lines: string[] = ['<annotation-config>'];

    for (const field of config.fields) {
        const required = field.required ? ' required="true"' : ' required="false"';
        const showConf = field.type === 'entity-list' && field.entityConfidence ? ' show-confidence="true"' : '';
        const sourceField = field.type === 'entity-list' && field.sourceField ? ` source-field="${escapeAttr(field.sourceField)}"` : '';
        lines.push(`  <field id="${escapeAttr(field.id)}" type="${field.type}"${required}${showConf}${sourceField}>`);
        lines.push(`    <label>${escapeText(field.label)}</label>`);

        if (field.placeholder) {
            lines.push(`    <placeholder>${escapeText(field.placeholder)}</placeholder>`);
        }

        if ((field.type === 'dropdown' || field.type === 'radio') && field.options?.length) {
            lines.push('    <options>');
            for (const opt of field.options) {
                lines.push(`      <option value="${escapeAttr(opt.value)}">${escapeText(opt.label)}</option>`);
            }
            lines.push('    </options>');
        }

        if (field.type === 'entity-list' && field.entityTypes?.length) {
            lines.push('    <entity-types>');
            for (const et of field.entityTypes) {
                lines.push(`      <type value="${escapeAttr(et.value)}">${escapeText(et.label)}</type>`);
            }
            lines.push('    </entity-types>');
        }

        if (field.type === 'rating-scale' && field.ratingConfig) {
            const r = field.ratingConfig;
            const minLabel = r.minLabel ? ` min-label="${escapeAttr(r.minLabel)}"` : '';
            const maxLabel = r.maxLabel ? ` max-label="${escapeAttr(r.maxLabel)}"` : '';
            lines.push(`    <rating min="${r.min}" max="${r.max}"${minLabel}${maxLabel} style="${r.style}" />`);
        }

        lines.push('  </field>');
    }

    lines.push('</annotation-config>');
    return lines.join('\n');
}

function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Generate a safe field ID from a label string.
 * Ensures uniqueness against an existing set of IDs.
 */
export function labelToId(label: string, existingIds: Set<string> = new Set()): string {
    let base = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        || 'field';

    if (!existingIds.has(base)) return base;

    let n = 2;
    while (existingIds.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
}

/**
 * Create a blank FieldConfig for a given type with sensible defaults.
 */
export function createDefaultField(type: FieldConfig['type'], existingIds: Set<string>): FieldConfig {
    const label = TYPE_DEFAULT_LABELS[type] ?? 'New Field';
    const id = labelToId(label, existingIds);

    const base: FieldConfig = { id, type, label, required: false };

    if (type === 'dropdown' || type === 'radio') {
        base.options = [
            { value: 'option_1', label: 'Option 1' },
            { value: 'option_2', label: 'Option 2' },
        ];
    }

    if (type === 'rating-scale') {
        base.ratingConfig = { min: 1, max: 5, style: 'numbers' };
    }

    if (type === 'entity-list') {
        base.entityTypes = [
            { value: 'PER',  label: 'Person' },
            { value: 'ORG',  label: 'Organization' },
            { value: 'LOC',  label: 'Location' },
            { value: 'DATE', label: 'Date / Time' },
            { value: 'MISC', label: 'Miscellaneous' },
        ];
        base.entityConfidence = true;
    }

    return base;
}

const TYPE_DEFAULT_LABELS: Partial<Record<FieldConfig['type'], string>> = {
    text: 'Text Field',
    textarea: 'Long Text',
    dropdown: 'Dropdown',
    radio: 'Radio Group',
    checkbox: 'Checkbox',
    'rating-scale': 'Rating Scale',
    'entity-list': 'Entity List',
};
