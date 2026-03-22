/**
 * Unit tests for APKG parser helper methods
 * Tests individual parsing functions for deck names, media references, and field mapping
 */

import 'reflect-metadata';

// TODO: Import parser service/utilities once implementation is complete
// import { ApkgParserService } from '../services/apkg-parser.service.js';
// import { EchoeImportService } from '../services/echoe-import.service.js';

/**
 * Temporary helper implementations for testing
 * These should be replaced with actual service methods once implemented
 */

/**
 * Parse hierarchical deck name
 * Input: "Parent::Child::Grandchild"
 * Output: { parent: "Parent::Child", name: "Grandchild", fullPath: "Parent::Child::Grandchild" }
 */
function parseDeckHierarchy(deckName: string): { parent: string | null; name: string; fullPath: string } {
  const parts = deckName.split('::');
  if (parts.length === 1) {
    return { parent: null, name: deckName, fullPath: deckName };
  }

  const name = parts[parts.length - 1];
  const parent = parts.slice(0, -1).join('::');
  return { parent, name, fullPath: deckName };
}

/**
 * Extract media references from HTML content
 * Finds both [sound:...] and <img src="..."> patterns
 */
function extractMediaReferences(html: string): string[] {
  const references: string[] = [];

  // Extract [sound:filename] patterns
  const soundMatches = html.matchAll(/\[sound:([^\]]+)\]/g);
  for (const match of soundMatches) {
    references.push(match[1]);
  }

  // Extract <img src="filename"> patterns
  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const match of imgMatches) {
    references.push(match[1]);
  }

  return references;
}

/**
 * Split Anki note field string into array
 * Fields are separated by \x1f (ASCII 31)
 */
function splitFields(fieldString: string): string[] {
  return fieldString.split('\x1f');
}

/**
 * Map field values to field names using notetype definition
 */
function mapFieldsToNames(fieldValues: string[], fieldNames: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (let i = 0; i < fieldNames.length; i++) {
    result[fieldNames[i]] = fieldValues[i] ?? '';
  }

  return result;
}

/**
 * Build reverse media mapping (filename -> numeric key)
 */
function buildReverseMediaMap(mediaManifest: Map<string, string>): Map<string, string> {
  const reverseMap = new Map<string, string>();

  for (const [key, filename] of mediaManifest) {
    reverseMap.set(filename, key);
  }

  return reverseMap;
}

/**
 * Resolve media reference to actual filename using manifest
 */
function resolveMediaReference(reference: string, mediaManifest: Map<string, string>): string {
  // If reference is numeric (e.g., "0", "123"), look it up in manifest
  if (/^\d+$/.test(reference)) {
    return mediaManifest.get(reference) ?? reference;
  }

  // Otherwise, it's already the actual filename
  return reference;
}

describe('APKG Parser Helper Methods', () => {
  describe('parseDeckHierarchy', () => {
    it('should parse single-level deck name', () => {
      const result = parseDeckHierarchy('SimpleDeck');

      expect(result.parent).toBeNull();
      expect(result.name).toBe('SimpleDeck');
      expect(result.fullPath).toBe('SimpleDeck');
    });

    it('should parse two-level deck name', () => {
      const result = parseDeckHierarchy('英语单词::大学四级英语单词');

      expect(result.parent).toBe('英语单词');
      expect(result.name).toBe('大学四级英语单词');
      expect(result.fullPath).toBe('英语单词::大学四级英语单词');
    });

    it('should parse three-level deck name', () => {
      const result = parseDeckHierarchy('Level1::Level2::Level3');

      expect(result.parent).toBe('Level1::Level2');
      expect(result.name).toBe('Level3');
      expect(result.fullPath).toBe('Level1::Level2::Level3');
    });

    it('should handle deck name with special characters', () => {
      const result = parseDeckHierarchy('语言学习::英语::CET-4');

      expect(result.parent).toBe('语言学习::英语');
      expect(result.name).toBe('CET-4');
    });

    it('should handle empty parts gracefully', () => {
      // Edge case: deck name with empty parts
      const result = parseDeckHierarchy('Parent::::Child');

      // Should preserve the structure as-is
      expect(result.fullPath).toBe('Parent::::Child');
    });
  });

  describe('extractMediaReferences', () => {
    it('should extract single sound reference', () => {
      const html = 'Text before [sound:audio.mp3] text after';
      const refs = extractMediaReferences(html);

      expect(refs).toEqual(['audio.mp3']);
    });

    it('should extract multiple sound references', () => {
      const html = '[sound:a.mp3] middle [sound:b.mp3] end [sound:c.mp3]';
      const refs = extractMediaReferences(html);

      expect(refs).toEqual(['a.mp3', 'b.mp3', 'c.mp3']);
    });

    it('should extract single image reference', () => {
      const html = '<img src="image.jpg">';
      const refs = extractMediaReferences(html);

      expect(refs).toEqual(['image.jpg']);
    });

    it('should extract multiple image references', () => {
      const html = '<img src="a.jpg"> text <img src="b.png" />';
      const refs = extractMediaReferences(html);

      expect(refs).toEqual(['a.jpg', 'b.png']);
    });

    it('should extract mixed media references', () => {
      const html = 'Text [sound:audio.mp3] with <img src="image.jpg"> elements [sound:audio2.mp3]';
      const refs = extractMediaReferences(html);

      expect(refs).toEqual(['audio.mp3', 'audio2.mp3', 'image.jpg']);
    });

    it('should extract numeric references (Anki 2.0 format)', () => {
      const html = '[sound:0] and <img src="123">';
      const refs = extractMediaReferences(html);

      expect(refs).toEqual(['0', '123']);
    });

    it('should handle references with paths', () => {
      const html = '[sound:folder/audio.mp3] and <img src="images/pic.jpg">';
      const refs = extractMediaReferences(html);

      expect(refs).toEqual(['folder/audio.mp3', 'images/pic.jpg']);
    });

    it('should return empty array when no references found', () => {
      const html = '<p>Just plain text with no media</p>';
      const refs = extractMediaReferences(html);

      expect(refs).toEqual([]);
    });

    it('should handle malformed HTML gracefully', () => {
      const html = '<img src="valid.jpg"> <img src= [sound:audio.mp3]';
      const refs = extractMediaReferences(html);

      // Should still extract valid references
      expect(refs).toContain('valid.jpg');
      expect(refs).toContain('audio.mp3');
    });

    it('should handle Chinese filenames', () => {
      const html = '[sound:音频文件.mp3] and <img src="图片.jpg">';
      const refs = extractMediaReferences(html);

      expect(refs).toEqual(['音频文件.mp3', '图片.jpg']);
    });
  });

  describe('splitFields', () => {
    it('should split fields separated by \\x1f', () => {
      const flds = 'Field1\x1fField2\x1fField3';
      const fields = splitFields(flds);

      expect(fields).toEqual(['Field1', 'Field2', 'Field3']);
    });

    it('should handle single field', () => {
      const flds = 'OnlyField';
      const fields = splitFields(flds);

      expect(fields).toEqual(['OnlyField']);
    });

    it('should handle empty fields', () => {
      const flds = 'Field1\x1f\x1fField3';
      const fields = splitFields(flds);

      expect(fields).toEqual(['Field1', '', 'Field3']);
    });

    it('should handle all empty fields', () => {
      const flds = '\x1f\x1f';
      const fields = splitFields(flds);

      expect(fields).toEqual(['', '', '']);
    });

    it('should handle fields with HTML content', () => {
      const flds = '<b>Bold</b>\x1f<i>Italic</i>\x1f[sound:audio.mp3]';
      const fields = splitFields(flds);

      expect(fields).toEqual(['<b>Bold</b>', '<i>Italic</i>', '[sound:audio.mp3]']);
    });

    it('should handle Chinese text', () => {
      const flds = '前面\x1f问题\x1f答案\x1f提示';
      const fields = splitFields(flds);

      expect(fields).toEqual(['前面', '问题', '答案', '提示']);
    });
  });

  describe('mapFieldsToNames', () => {
    it('should map fields to names correctly', () => {
      const values = ['Value1', 'Value2', 'Value3'];
      const names = ['Front', 'Back', 'Hint'];
      const result = mapFieldsToNames(values, names);

      expect(result).toEqual({
        Front: 'Value1',
        Back: 'Value2',
        Hint: 'Value3',
      });
    });

    it('should handle more names than values', () => {
      const values = ['Value1', 'Value2'];
      const names = ['Front', 'Back', 'Hint', 'Extra'];
      const result = mapFieldsToNames(values, names);

      expect(result).toEqual({
        Front: 'Value1',
        Back: 'Value2',
        Hint: '',
        Extra: '',
      });
    });

    it('should handle more values than names', () => {
      const values = ['Value1', 'Value2', 'Value3', 'Value4'];
      const names = ['Front', 'Back'];
      const result = mapFieldsToNames(values, names);

      // Only map the available names
      expect(result).toEqual({
        Front: 'Value1',
        Back: 'Value2',
      });
    });

    it('should handle empty values', () => {
      const values = ['Value1', '', 'Value3'];
      const names = ['Front', 'Back', 'Hint'];
      const result = mapFieldsToNames(values, names);

      expect(result).toEqual({
        Front: 'Value1',
        Back: '',
        Hint: 'Value3',
      });
    });

    it('should handle Chinese field names', () => {
      const values = ['问题内容', '答案内容'];
      const names = ['正面', '背面'];
      const result = mapFieldsToNames(values, names);

      expect(result).toEqual({
        正面: '问题内容',
        背面: '答案内容',
      });
    });
  });

  describe('buildReverseMediaMap', () => {
    it('should build reverse mapping from manifest', () => {
      const manifest = new Map<string, string>([
        ['0', 'audio1.mp3'],
        ['1', 'audio2.mp3'],
        ['2', 'image.jpg'],
      ]);

      const reverseMap = buildReverseMediaMap(manifest);

      expect(reverseMap.get('audio1.mp3')).toBe('0');
      expect(reverseMap.get('audio2.mp3')).toBe('1');
      expect(reverseMap.get('image.jpg')).toBe('2');
    });

    it('should handle empty manifest', () => {
      const manifest = new Map<string, string>();
      const reverseMap = buildReverseMediaMap(manifest);

      expect(reverseMap.size).toBe(0);
    });

    it('should handle Chinese filenames', () => {
      const manifest = new Map<string, string>([
        ['0', '音频文件.mp3'],
        ['1', '图片.jpg'],
      ]);

      const reverseMap = buildReverseMediaMap(manifest);

      expect(reverseMap.get('音频文件.mp3')).toBe('0');
      expect(reverseMap.get('图片.jpg')).toBe('1');
    });
  });

  describe('resolveMediaReference', () => {
    let manifest: Map<string, string>;

    beforeEach(() => {
      manifest = new Map<string, string>([
        ['0', 'audio1.mp3'],
        ['1', 'audio2.mp3'],
        ['123', 'image.jpg'],
      ]);
    });

    it('should resolve numeric reference to filename', () => {
      expect(resolveMediaReference('0', manifest)).toBe('audio1.mp3');
      expect(resolveMediaReference('1', manifest)).toBe('audio2.mp3');
      expect(resolveMediaReference('123', manifest)).toBe('image.jpg');
    });

    it('should return actual filename as-is', () => {
      expect(resolveMediaReference('myaudio.mp3', manifest)).toBe('myaudio.mp3');
      expect(resolveMediaReference('image.png', manifest)).toBe('image.png');
    });

    it('should return reference as-is if not found in manifest', () => {
      expect(resolveMediaReference('999', manifest)).toBe('999');
    });

    it('should handle Chinese filenames', () => {
      const chineseManifest = new Map<string, string>([
        ['0', '音频.mp3'],
      ]);

      expect(resolveMediaReference('0', chineseManifest)).toBe('音频.mp3');
      expect(resolveMediaReference('其他文件.mp3', chineseManifest)).toBe('其他文件.mp3');
    });
  });

  describe('getMediaFileByOriginalName', () => {
    it.todo('should find media file in ZIP by original filename');
    it.todo('should find media file in ZIP by numeric key');
    it.todo('should return null when file not found');
  });

  describe('getFieldMap', () => {
    it.todo('should build field map from notetype definition');
    it.todo('should handle missing notetype gracefully');
    it.todo('should preserve field order');
  });
});
