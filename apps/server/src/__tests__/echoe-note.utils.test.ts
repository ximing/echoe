import { safeJsonParse, parseNoteFields, parseTags } from '../utils/echoe-note.utils.js';

// ---------------------------------------------------------------------------
// safeJsonParse
// ---------------------------------------------------------------------------
describe('safeJsonParse', () => {
  it('parses a valid JSON string', () => {
    expect(safeJsonParse<string[]>('["a","b"]', [])).toEqual(['a', 'b']);
  });

  it('parses a valid JSON object', () => {
    expect(safeJsonParse<Record<string, number>>('{"x":1}', {})).toEqual({ x: 1 });
  });

  it('returns fallback for null input', () => {
    expect(safeJsonParse<string[]>(null, [])).toEqual([]);
  });

  it('returns fallback for undefined input', () => {
    expect(safeJsonParse<string[]>(undefined, [])).toEqual([]);
  });

  it('returns fallback for empty string', () => {
    expect(safeJsonParse<number>('' , 42)).toBe(42);
  });

  it('returns fallback for malformed JSON', () => {
    expect(safeJsonParse<string[]>('{bad json}', ['fallback'])).toEqual(['fallback']);
  });

  it('returns numeric fallback for malformed JSON', () => {
    expect(safeJsonParse<number>('not-a-number', 0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseNoteFields
// ---------------------------------------------------------------------------
describe('parseNoteFields', () => {
  it('returns fieldsJson when it has entries', () => {
    const fieldsJson = { Front: 'Hello', Back: 'World' };
    expect(parseNoteFields(fieldsJson, 'ignored')).toEqual({ Front: 'Hello', Back: 'World' });
  });

  it('falls back to { Front: sfld } when fieldsJson is null', () => {
    expect(parseNoteFields(null, 'my front')).toEqual({ Front: 'my front' });
  });

  it('falls back to { Front: sfld } when fieldsJson is empty object', () => {
    expect(parseNoteFields({}, 'my front')).toEqual({ Front: 'my front' });
  });

  it('returns empty object when fieldsJson is null and sfld is null', () => {
    expect(parseNoteFields(null, null)).toEqual({});
  });

  it('returns empty object when fieldsJson is null and sfld is empty string', () => {
    // empty string is falsy, so sfld ? ... returns {}
    expect(parseNoteFields(null, '')).toEqual({});
  });

  it('returns empty object when fieldsJson is undefined and sfld is null', () => {
    expect(parseNoteFields(undefined, null)).toEqual({});
  });

  it('uses fieldsJson even if sfld is provided', () => {
    const fieldsJson = { Question: 'Q', Answer: 'A' };
    expect(parseNoteFields(fieldsJson, 'should be ignored')).toEqual({ Question: 'Q', Answer: 'A' });
  });
});

// ---------------------------------------------------------------------------
// parseTags
// ---------------------------------------------------------------------------
describe('parseTags', () => {
  it('parses a JSON array of tags', () => {
    expect(parseTags('["tag1","tag2","tag3"]')).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('returns empty array for null', () => {
    expect(parseTags(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseTags('')).toEqual([]);
  });

  it('filters out non-string items in JSON array', () => {
    // JSON with mixed types – only strings should pass through
    expect(parseTags('["a",1,null,"b"]')).toEqual(['a', 'b']);
  });

  it('falls back to space-delimited parsing for Anki legacy format', () => {
    expect(parseTags('tag1 tag2 tag3')).toEqual(['tag1', 'tag2', 'tag3']);
  });

  it('handles multiple spaces in Anki legacy format', () => {
    expect(parseTags('  tag1   tag2  ')).toEqual(['tag1', 'tag2']);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseTags('   ')).toEqual([]);
  });

  it('returns empty array when JSON parses to a non-array', () => {
    // JSON object is not an array – parseTags should return []
    expect(parseTags('{"key":"value"}')).toEqual([]);
  });

  it('handles single tag', () => {
    expect(parseTags('["leech"]')).toEqual(['leech']);
  });
});
