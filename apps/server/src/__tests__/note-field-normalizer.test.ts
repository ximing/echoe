import { createHash } from 'crypto';
import { normalizeNoteFields } from '../lib/note-field-normalizer.js';
import type { ProseMirrorJsonDoc } from '../types/note-fields.js';

/** Helper: compute expected csum from sfld */
function expectedCsum(sfld: string): number {
  const hash = createHash('sha1').update(sfld, 'utf8').digest('hex');
  return parseInt(hash.slice(0, 8), 16);
}

/** Helper: build a simple plain-text paragraph doc */
const paragraphDoc = (text: string): ProseMirrorJsonDoc => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text }],
    },
  ],
});

describe('normalizeNoteFields', () => {
  describe('plain-text field input', () => {
    it('produces correct flds, sfld, csum for plain-text fields', () => {
      const result = normalizeNoteFields({
        notetypeFields: ['Front', 'Back'],
        fields: { Front: 'Hello', Back: 'World' },
      });

      expect(result.fieldsJson).toEqual({ Front: 'Hello', Back: 'World' });
      expect(result.fldNames).toEqual(['Front', 'Back']);
      expect(result.flds).toBe('Hello\x1fWorld');
      expect(result.sfld).toBe('Hello');
      expect(result.csum).toBe(expectedCsum('Hello'));
    });

    it('uses empty string for missing fields', () => {
      const result = normalizeNoteFields({
        notetypeFields: ['Front', 'Back', 'Extra'],
        fields: { Front: 'Q' },
      });

      expect(result.fieldsJson).toEqual({ Front: 'Q', Back: '', Extra: '' });
      expect(result.flds).toBe('Q\x1f\x1f');
      expect(result.sfld).toBe('Q');
    });

    it('handles empty fields object', () => {
      const result = normalizeNoteFields({
        notetypeFields: ['Front', 'Back'],
        fields: {},
      });

      expect(result.fieldsJson).toEqual({ Front: '', Back: '' });
      expect(result.flds).toBe('\x1f');
      expect(result.sfld).toBe('');
      expect(result.csum).toBe(expectedCsum(''));
    });
  });

  describe('rich-text field input', () => {
    it('converts richTextFields to HTML and stores in fieldsJson', () => {
      const frontDoc = paragraphDoc('Rich Front');
      const result = normalizeNoteFields({
        notetypeFields: ['Front', 'Back'],
        richTextFields: { Front: frontDoc },
        fields: { Back: 'Plain Back' },
      });

      expect(result.fieldsJson['Front']).toContain('<p>');
      expect(result.fieldsJson['Front']).toContain('Rich Front');
      expect(result.fieldsJson['Back']).toBe('Plain Back');
    });

    it('uses plain text of richTextField for sfld', () => {
      const frontDoc = paragraphDoc('Sort Field Text');
      const result = normalizeNoteFields({
        notetypeFields: ['Front', 'Back'],
        richTextFields: { Front: frontDoc },
      });

      expect(result.sfld).toBe('Sort Field Text');
      expect(result.csum).toBe(expectedCsum('Sort Field Text'));
    });

    it('richTextFields take precedence over fields for the same key', () => {
      const frontDoc = paragraphDoc('Rich version');
      const result = normalizeNoteFields({
        notetypeFields: ['Front'],
        fields: { Front: 'Plain version' },
        richTextFields: { Front: frontDoc },
      });

      expect(result.fieldsJson['Front']).toContain('Rich version');
      expect(result.fieldsJson['Front']).not.toBe('Plain version');
    });
  });

  describe('mixed input', () => {
    it('handles mix of plain-text and rich-text fields', () => {
      const backDoc: ProseMirrorJsonDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            ],
          },
        ],
      };

      const result = normalizeNoteFields({
        notetypeFields: ['Front', 'Back', 'Notes'],
        fields: { Front: 'Question', Notes: 'Extra info' },
        richTextFields: { Back: backDoc },
      });

      expect(result.fieldsJson['Front']).toBe('Question');
      expect(result.fieldsJson['Back']).toContain('<strong>');
      expect(result.fieldsJson['Back']).toContain('bold');
      expect(result.fieldsJson['Notes']).toBe('Extra info');
      expect(result.flds).toBe(`Question\x1f${result.fieldsJson['Back']}\x1fExtra info`);
      expect(result.sfld).toBe('Question');
    });
  });

  describe('empty field handling', () => {
    it('handles no fields and no richTextFields', () => {
      const result = normalizeNoteFields({
        notetypeFields: ['Front', 'Back'],
      });

      expect(result.fieldsJson).toEqual({ Front: '', Back: '' });
      expect(result.flds).toBe('\x1f');
      expect(result.sfld).toBe('');
      expect(result.csum).toBe(expectedCsum(''));
    });

    it('handles single field notetype', () => {
      const result = normalizeNoteFields({
        notetypeFields: ['Content'],
        fields: { Content: 'Only field' },
      });

      expect(result.fieldsJson).toEqual({ Content: 'Only field' });
      expect(result.flds).toBe('Only field');
      expect(result.sfld).toBe('Only field');
    });
  });

  describe('multi-field order verification', () => {
    it('preserves notetypeFields order in flds regardless of input order', () => {
      const result = normalizeNoteFields({
        notetypeFields: ['A', 'B', 'C', 'D'],
        fields: { D: 'four', B: 'two', A: 'one', C: 'three' },
      });

      expect(result.flds).toBe('one\x1ftwo\x1fthree\x1ffour');
      expect(result.fldNames).toEqual(['A', 'B', 'C', 'D']);
    });

    it('sfld is always the first notetypeField value', () => {
      const result = normalizeNoteFields({
        notetypeFields: ['Z', 'A', 'M'],
        fields: { Z: 'first', A: 'second', M: 'third' },
      });

      expect(result.sfld).toBe('first');
    });
  });
});
