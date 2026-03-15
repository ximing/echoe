/**
 * Note field normalizer module.
 * Provides a single normalizeNoteFields function that accepts raw field inputs
 * and produces all derived field values, ensuring all write paths share one
 * consistent implementation.
 */

import { createHash } from 'crypto';
import type { CanonicalFields, RichTextFields } from '../types/note-fields.js';
import { serializeToHtml, serializeToPlainText } from './prosemirror-serializer.js';

/**
 * Input for the note field normalizer.
 * - notetypeFields: ordered list of field names defined by the notetype
 * - fields: plain-text or HTML field values (keyed by field name)
 * - richTextFields: ProseMirror JSON documents (keyed by field name); takes precedence over fields for the same key
 */
export interface NormalizerInput {
  /** Ordered list of field names as defined by the notetype */
  notetypeFields: string[];
  /** Plain-text or HTML field values, keyed by field name */
  fields?: Record<string, string>;
  /** ProseMirror JSON documents, keyed by field name; converted server-side to HTML */
  richTextFields?: RichTextFields;
}

/**
 * Output from the note field normalizer.
 * Contains all derived field values needed for database storage.
 */
export interface NormalizerOutput {
  /** Primary structured field storage: field name → HTML/plain-text value */
  fieldsJson: CanonicalFields;
  /** Ordered list of field names (same as notetypeFields) */
  fldNames: string[];
  /** Field values joined by \x1f (unit separator), in notetypeFields order */
  flds: string;
  /** Sort field: plain text of the first field */
  sfld: string;
  /** Anki-compatible checksum: parseInt(sha1(sfld).slice(0, 8), 16).toString() */
  csum: string;
}

/**
 * Computes an Anki-compatible checksum for the given sort field value.
 * @param sfld - The sort field plain-text string
 * @returns parseInt(sha1(sfld).slice(0, 8), 16).toString()
 */
function computeCsum(sfld: string): string {
  const hash = createHash('sha1').update(sfld, 'utf8').digest('hex');
  return parseInt(hash.slice(0, 8), 16).toString();
}

/**
 * Normalizes note fields from raw input into all derived field values.
 *
 * Processing order:
 * 1. Start with plain-text/HTML fields (if provided)
 * 2. Convert richTextFields via prosemirror-serializer and merge (richTextFields take precedence)
 * 3. Build fieldsJson from merged values
 * 4. Compute flds (joined by \x1f in notetypeFields order)
 * 5. Compute sfld (plain text of first field)
 * 6. Compute csum from sfld
 *
 * @param input - Raw field inputs
 * @returns All derived field values for database storage
 */
export function normalizeNoteFields(input: NormalizerInput): NormalizerOutput {
  const { notetypeFields, fields = {}, richTextFields = {} } = input;

  // Start with plain-text/HTML fields, then overlay rich text conversions
  const merged: Record<string, string> = { ...fields };

  // Convert richTextFields to HTML and merge (takes precedence)
  for (const [fieldName, doc] of Object.entries(richTextFields)) {
    merged[fieldName] = serializeToHtml(doc);
  }

  // Build canonical fields in notetypeFields order
  const fieldsJson: CanonicalFields = {};
  for (const fieldName of notetypeFields) {
    fieldsJson[fieldName] = merged[fieldName] ?? '';
  }

  // flds: join field values by \x1f in notetypeFields order
  const flds = notetypeFields.map((name) => fieldsJson[name] ?? '').join('\x1f');

  // sfld: plain text of the first field
  let sfld = '';
  if (notetypeFields.length > 0) {
    const firstFieldName = notetypeFields[0];
    const firstFieldValue = merged[firstFieldName] ?? '';

    // If the first field came from richTextFields, we already have HTML; use serializeToPlainText on the original doc
    if (richTextFields[firstFieldName]) {
      sfld = serializeToPlainText(richTextFields[firstFieldName]);
    } else {
      // Strip HTML tags for plain-text sfld
      sfld = firstFieldValue.replace(/<[^>]*>/g, '').trim();
    }
  }

  // csum: Anki-compatible checksum
  const csum = computeCsum(sfld);

  return {
    fieldsJson,
    fldNames: [...notetypeFields],
    flds,
    sfld,
    csum,
  };
}
