import 'reflect-metadata';
import { EchoeDuplicateService } from '../services/echoe-duplicate.service.js';

describe('EchoeDuplicateService', () => {
  let service: EchoeDuplicateService;

  beforeEach(() => {
    service = new EchoeDuplicateService();
  });

  describe('levenshteinSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      const result = service.levenshteinSimilarity('hello', 'hello');
      expect(result).toBe(1.0);
    });

    it('should return 0.0 for completely different strings', () => {
      const result = service.levenshteinSimilarity('a', 'b');
      expect(result).toBe(0.0);
    });

    it('should return value between 0 and 1 for similar strings', () => {
      const result = service.levenshteinSimilarity('hello', 'hallo');
      expect(result).toBeGreaterThan(0.0);
      expect(result).toBeLessThan(1.0);
    });

    it('should be case insensitive', () => {
      const result = service.levenshteinSimilarity('Hello', 'HELLO');
      expect(result).toBe(1.0);
    });

    it('should handle empty strings', () => {
      const result = service.levenshteinSimilarity('', 'hello');
      expect(result).toBe(0.0);
    });
  });

  describe('findExactDuplicates', () => {
    it('should group notes with identical field values', () => {
      const notes = [
        { id: 1, sfld: 'Hello', flds: 'Hello\tWorld' },
        { id: 2, sfld: 'Hello', flds: 'Hello\tThere' },
        { id: 3, sfld: 'Goodbye', flds: 'Goodbye\tWorld' },
      ];

      // Front field is at index 0, so value is "Hello" for first two
      const fieldIndex = 0;
      const result = service.findExactDuplicates(notes as any, fieldIndex);

      expect(result.length).toBe(1);
      expect(result[0].notes.length).toBe(2);
    });

    it('should return empty array when no duplicates', () => {
      const notes = [
        { id: 1, sfld: 'Hello', flds: 'Hello\tWorld' },
        { id: 2, sfld: 'Goodbye', flds: 'Goodbye\tWorld' },
      ];

      const fieldIndex = 0;
      const result = service.findExactDuplicates(notes as any, fieldIndex);

      expect(result.length).toBe(0);
    });

    it('should handle single note', () => {
      const notes = [{ id: 1, sfld: 'Hello', flds: 'Hello\tWorld' }];

      const fieldIndex = 0;
      const result = service.findExactDuplicates(notes as any, fieldIndex);

      expect(result.length).toBe(0);
    });
  });

  describe('findSimilarDuplicates', () => {
    it('should find notes above threshold', () => {
      const notes = [
        { id: 1, sfld: 'Hello World', flds: 'Hello World\tTest' },
        { id: 2, sfld: 'Hello World', flds: 'Hello World\tAnother' },
        { id: 3, sfld: 'Hello Worrld', flds: 'Hello Worrld\tTest' },
        { id: 4, sfld: 'Goodbye', flds: 'Goodbye\tTest' },
      ];

      const fieldIndex = 0;
      const threshold = 0.8;
      const result = service.findSimilarDuplicates(notes as any, fieldIndex, threshold);

      // Notes 1 and 2 are identical (1.0)
      // Notes 1 and 3 are similar (~0.92)
      // Should find groups
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty when threshold is too high', () => {
      const notes = [
        { id: 1, sfld: 'Hello', flds: 'Hello\tWorld' },
        { id: 2, sfld: 'Hallo', flds: 'Hallo\tWorld' },
      ];

      const fieldIndex = 0;
      const threshold = 1.0; // Only exact matches
      const result = service.findSimilarDuplicates(notes as any, fieldIndex, threshold);

      expect(result.length).toBe(0);
    });
  });
});
