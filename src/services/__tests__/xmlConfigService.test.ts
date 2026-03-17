/**
 * Tests for Feature 1 & 4: xmlConfigService + xmlConfigSerializer
 *
 * Covers:
 *  - Parsing all 6 field types (textarea, text, dropdown, checkbox, radio, rating-scale)
 *  - RatingConfig parsing with all attributes
 *  - Error handling for malformed XML
 *  - Round-trip: parse → serialize → parse produces identical output
 *  - labelToId collision avoidance
 *  - createDefaultField for every type
 */

import { describe, it, expect } from 'vitest';
import { parseAnnotationConfigXML } from '../xmlConfigService';
import {
    serializeAnnotationConfigXML,
    labelToId,
    createDefaultField,
} from '../xmlConfigSerializer';
import type { AnnotationConfig, FieldConfig } from '../xmlConfigService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parse(xml: string): AnnotationConfig {
    return parseAnnotationConfigXML(xml);
}

const SENTIMENT_XML = `
<annotation-config>
  <field id="sentiment" type="radio" required="true">
    <label>Sentiment</label>
    <options>
      <option value="positive">Positive</option>
      <option value="neutral">Neutral</option>
      <option value="negative">Negative</option>
    </options>
  </field>
  <field id="reason" type="textarea" required="false">
    <label>Reason</label>
    <placeholder>Explain your choice...</placeholder>
  </field>
</annotation-config>
`;

const RATING_XML = `
<annotation-config>
  <field id="quality" type="rating-scale" required="true">
    <label>Quality Score</label>
    <rating min="1" max="5" min-label="Poor" max-label="Excellent" style="stars" />
  </field>
</annotation-config>
`;

const FULL_XML = `
<annotation-config>
  <field id="f_text" type="text" required="false">
    <label>Short Text</label>
    <placeholder>Enter text...</placeholder>
  </field>
  <field id="f_textarea" type="textarea" required="true">
    <label>Long Text</label>
  </field>
  <field id="f_dropdown" type="dropdown" required="false">
    <label>Dropdown</label>
    <options>
      <option value="a">Option A</option>
      <option value="b">Option B</option>
    </options>
  </field>
  <field id="f_checkbox" type="checkbox" required="false">
    <label>Agree</label>
    <placeholder>I agree</placeholder>
  </field>
  <field id="f_radio" type="radio" required="true">
    <label>Choice</label>
    <options>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </options>
  </field>
  <field id="f_rating" type="rating-scale" required="false">
    <label>Rating</label>
    <rating min="1" max="10" min-label="Low" max-label="High" style="numbers" />
  </field>
</annotation-config>
`;

// ---------------------------------------------------------------------------
// Feature 1: Parsing
// ---------------------------------------------------------------------------
describe('parseAnnotationConfigXML', () => {
    describe('radio type', () => {
        it('parses type as radio', () => {
            const { fields } = parse(SENTIMENT_XML);
            expect(fields[0].type).toBe('radio');
        });

        it('parses all options', () => {
            const { fields } = parse(SENTIMENT_XML);
            expect(fields[0].options).toHaveLength(3);
            expect(fields[0].options![0]).toEqual({ value: 'positive', label: 'Positive' });
            expect(fields[0].options![2]).toEqual({ value: 'negative', label: 'Negative' });
        });

        it('parses required=true', () => {
            const { fields } = parse(SENTIMENT_XML);
            expect(fields[0].required).toBe(true);
        });

        it('parses required=false on second field', () => {
            const { fields } = parse(SENTIMENT_XML);
            expect(fields[1].required).toBe(false);
        });

        it('parses label and placeholder', () => {
            const { fields } = parse(SENTIMENT_XML);
            expect(fields[1].label).toBe('Reason');
            expect(fields[1].placeholder).toBe('Explain your choice...');
        });
    });

    describe('rating-scale type', () => {
        it('parses type as rating-scale', () => {
            const { fields } = parse(RATING_XML);
            expect(fields[0].type).toBe('rating-scale');
        });

        it('parses ratingConfig with all attributes', () => {
            const { fields } = parse(RATING_XML);
            expect(fields[0].ratingConfig).toEqual({
                min: 1,
                max: 5,
                minLabel: 'Poor',
                maxLabel: 'Excellent',
                style: 'stars',
            });
        });

        it('defaults to style=numbers when omitted', () => {
            const xml = `
              <annotation-config>
                <field id="r" type="rating-scale" required="false">
                  <label>R</label>
                  <rating min="1" max="3" />
                </field>
              </annotation-config>`;
            const { fields } = parse(xml);
            expect(fields[0].ratingConfig?.style).toBe('numbers');
        });

        it('defaults min to 1 and max to 5 when rating element absent', () => {
            const xml = `
              <annotation-config>
                <field id="r" type="rating-scale" required="false">
                  <label>R</label>
                </field>
              </annotation-config>`;
            const { fields } = parse(xml);
            expect(fields[0].ratingConfig?.min).toBe(1);
            expect(fields[0].ratingConfig?.max).toBe(5);
        });

        it('does not set options on rating-scale', () => {
            const { fields } = parse(RATING_XML);
            expect(fields[0].options).toBeUndefined();
        });
    });

    describe('all 6 field types in one config', () => {
        it('parses 6 fields', () => {
            const { fields } = parse(FULL_XML);
            expect(fields).toHaveLength(6);
        });

        it('preserves field order', () => {
            const { fields } = parse(FULL_XML);
            const types = fields.map(f => f.type);
            expect(types).toEqual(['text', 'textarea', 'dropdown', 'checkbox', 'radio', 'rating-scale']);
        });

        it('parses dropdown options correctly', () => {
            const { fields } = parse(FULL_XML);
            const dropdown = fields.find(f => f.type === 'dropdown')!;
            expect(dropdown.options).toHaveLength(2);
            expect(dropdown.options![1]).toEqual({ value: 'b', label: 'Option B' });
        });
    });

    describe('error handling', () => {
        it('throws on malformed XML', () => {
            expect(() => parse('<annotation-config><field')).toThrow();
        });

        it('skips fields without id', () => {
            const xml = `
              <annotation-config>
                <field type="text" required="false">
                  <label>No ID</label>
                </field>
                <field id="valid" type="text" required="false">
                  <label>Valid</label>
                </field>
              </annotation-config>`;
            const { fields } = parse(xml);
            expect(fields).toHaveLength(1);
            expect(fields[0].id).toBe('valid');
        });

        it('returns empty fields for empty annotation-config', () => {
            const { fields } = parse('<annotation-config></annotation-config>');
            expect(fields).toHaveLength(0);
        });
    });
});

// ---------------------------------------------------------------------------
// Feature 4: Serialization
// ---------------------------------------------------------------------------
describe('serializeAnnotationConfigXML', () => {
    it('serializes a radio field with options', () => {
        const config: AnnotationConfig = {
            fields: [{
                id: 'sentiment',
                type: 'radio',
                label: 'Sentiment',
                required: true,
                options: [
                    { value: 'positive', label: 'Positive' },
                    { value: 'negative', label: 'Negative' },
                ],
            }],
        };
        const xml = serializeAnnotationConfigXML(config);
        expect(xml).toContain('type="radio"');
        expect(xml).toContain('<option value="positive">Positive</option>');
        expect(xml).toContain('required="true"');
    });

    it('serializes a rating-scale field', () => {
        const config: AnnotationConfig = {
            fields: [{
                id: 'q',
                type: 'rating-scale',
                label: 'Quality',
                required: false,
                ratingConfig: { min: 1, max: 5, minLabel: 'Poor', maxLabel: 'Excellent', style: 'stars' },
            }],
        };
        const xml = serializeAnnotationConfigXML(config);
        expect(xml).toContain('type="rating-scale"');
        expect(xml).toContain('min="1"');
        expect(xml).toContain('max="5"');
        expect(xml).toContain('min-label="Poor"');
        expect(xml).toContain('max-label="Excellent"');
        expect(xml).toContain('style="stars"');
    });

    it('escapes special characters in labels and option values', () => {
        const config: AnnotationConfig = {
            fields: [{
                id: 'f',
                type: 'text',
                label: 'A & B <check>',
                required: false,
            }],
        };
        const xml = serializeAnnotationConfigXML(config);
        expect(xml).toContain('A &amp; B &lt;check&gt;');
    });

    it('omits min-label/max-label when not set', () => {
        const config: AnnotationConfig = {
            fields: [{
                id: 'r',
                type: 'rating-scale',
                label: 'R',
                required: false,
                ratingConfig: { min: 1, max: 5, style: 'numbers' },
            }],
        };
        const xml = serializeAnnotationConfigXML(config);
        expect(xml).not.toContain('min-label');
        expect(xml).not.toContain('max-label');
    });
});

// ---------------------------------------------------------------------------
// Round-trip: parse → serialize → parse
// ---------------------------------------------------------------------------
describe('round-trip fidelity', () => {
    it('round-trips all 6 field types without data loss', () => {
        const original = parse(FULL_XML);
        const serialized = serializeAnnotationConfigXML(original);
        const reparsed = parse(serialized);

        expect(reparsed.fields).toHaveLength(original.fields.length);

        for (let i = 0; i < original.fields.length; i++) {
            const orig = original.fields[i];
            const rep = reparsed.fields[i];
            expect(rep.id).toBe(orig.id);
            expect(rep.type).toBe(orig.type);
            expect(rep.label).toBe(orig.label);
            expect(rep.required).toBe(orig.required);

            if (orig.options) {
                expect(rep.options).toHaveLength(orig.options.length);
                orig.options.forEach((o, j) => {
                    expect(rep.options![j].value).toBe(o.value);
                    expect(rep.options![j].label).toBe(o.label);
                });
            }

            if (orig.ratingConfig) {
                expect(rep.ratingConfig).toEqual(orig.ratingConfig);
            }
        }
    });

    it('round-trips the Sentiment Classification built-in template', () => {
        const original = parse(SENTIMENT_XML);
        const xml2 = serializeAnnotationConfigXML(original);
        const reparsed = parse(xml2);
        expect(reparsed.fields[0].type).toBe('radio');
        expect(reparsed.fields[0].options).toHaveLength(3);
        expect(reparsed.fields[1].type).toBe('textarea');
    });
});

// ---------------------------------------------------------------------------
// labelToId and createDefaultField helpers
// ---------------------------------------------------------------------------
describe('labelToId', () => {
    it('converts a label to snake_case id', () => {
        expect(labelToId('Sentiment Analysis')).toBe('sentiment_analysis');
    });

    it('strips leading/trailing underscores', () => {
        expect(labelToId('  Hello World  ')).toBe('hello_world');
    });

    it('appends _2 on first collision', () => {
        const existing = new Set(['sentiment']);
        expect(labelToId('Sentiment', existing)).toBe('sentiment_2');
    });

    it('appends _3 on second collision', () => {
        const existing = new Set(['sentiment', 'sentiment_2']);
        expect(labelToId('Sentiment', existing)).toBe('sentiment_3');
    });

    it('falls back to "field" for empty/symbol-only labels', () => {
        expect(labelToId('---')).toBe('field');
    });
});

describe('createDefaultField', () => {
    it('creates a radio field with 2 default options', () => {
        const f = createDefaultField('radio', new Set());
        expect(f.type).toBe('radio');
        expect(f.options).toHaveLength(2);
    });

    it('creates a dropdown field with 2 default options', () => {
        const f = createDefaultField('dropdown', new Set());
        expect(f.type).toBe('dropdown');
        expect(f.options).toHaveLength(2);
    });

    it('creates a rating-scale field with default ratingConfig', () => {
        const f = createDefaultField('rating-scale', new Set());
        expect(f.ratingConfig).toEqual({ min: 1, max: 5, style: 'numbers' });
    });

    it('creates unique IDs when existing IDs are provided', () => {
        const ids = new Set(['text_field']);
        const f = createDefaultField('text', ids);
        expect(f.id).not.toBe('text_field');
        expect(f.id).toBe('text_field_2');
    });

    it('does not set ratingConfig on non-rating types', () => {
        const f = createDefaultField('text', new Set());
        expect(f.ratingConfig).toBeUndefined();
    });

    it('does not set options on text/textarea/checkbox types', () => {
        expect(createDefaultField('text', new Set()).options).toBeUndefined();
        expect(createDefaultField('textarea', new Set()).options).toBeUndefined();
        expect(createDefaultField('checkbox', new Set()).options).toBeUndefined();
    });
});
