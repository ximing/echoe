import { logger } from './logger.js';

/**
 * Safely parse a JSON string with a fallback value.
 * Logs a warning on parse failure (not an error - malformed JSON is expected for legacy data).
 */
export function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    logger.warn('Failed to parse JSON, using fallback', { json: String(json).slice(0, 200) });
    return fallback;
  }
}

/**
 * Parse note fields into a Record, preferring fieldsJson as primary source.
 * Falls back to `{ Front: sfld }` when fieldsJson is empty/null.
 */
export function parseNoteFields(
  fieldsJson: Record<string, string> | null | undefined,
  sfld: string | null
): Record<string, string> {
  if (fieldsJson && typeof fieldsJson === 'object' && Object.keys(fieldsJson).length > 0) {
    return fieldsJson;
  }
  return sfld ? { Front: sfld } : {};
}

/**
 * Parse note tags from a JSON string.
 * Supports:
 *   - JSON array format (primary): `["tag1","tag2"]`
 *   - Anki legacy space-delimited format: `"tag1 tag2"` (fallback)
 */
export function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === 'string');
    }
  } catch {
    // Not JSON – may be Anki legacy space-delimited format
    if (typeof tagsJson === 'string') {
      return tagsJson.trim().split(/\s+/).filter(Boolean);
    }
  }
  return [];
}
