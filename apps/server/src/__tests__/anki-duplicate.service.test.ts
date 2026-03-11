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
        { id: 1, sfld: 'Hello', flds: 'Hello\x1fWorld', fieldsJson: { Front: 'Hello', Back: 'World' } },
        { id: 2, sfld: 'Hello', flds: 'Hello\x1fThere', fieldsJson: { Front: 'Hello', Back: 'There' } },
        { id: 3, sfld: 'Goodbye', flds: 'Goodbye\x1fWorld', fieldsJson: { Front: 'Goodbye', Back: 'World' } },
      ];

      const result = service.findExactDuplicates(notes as any, 'Front');

      expect(result.length).toBe(1);
      expect(result[0].notes.length).toBe(2);
    });

    it('should return empty array when no duplicates', () => {
      const notes = [
        { id: 1, sfld: 'Hello', flds: 'Hello\x1fWorld', fieldsJson: { Front: 'Hello', Back: 'World' } },
        { id: 2, sfld: 'Goodbye', flds: 'Goodbye\x1fWorld', fieldsJson: { Front: 'Goodbye', Back: 'World' } },
      ];

      const result = service.findExactDuplicates(notes as any, 'Front');

      expect(result.length).toBe(0);
    });

    it('should handle single note', () => {
      const notes = [{ id: 1, sfld: 'Hello', flds: 'Hello\x1fWorld', fieldsJson: { Front: 'Hello', Back: 'World' } }];

      const result = service.findExactDuplicates(notes as any, 'Front');

      expect(result.length).toBe(0);
    });
  });

  describe('findSimilarDuplicates', () => {
    it('should find notes above threshold', () => {
      const notes = [
        { id: 1, sfld: 'Hello World', flds: 'Hello World\x1fTest', fieldsJson: { Front: 'Hello World', Back: 'Test' } },
        { id: 2, sfld: 'Hello World', flds: 'Hello World\x1fAnother', fieldsJson: { Front: 'Hello World', Back: 'Another' } },
        { id: 3, sfld: 'Hello Worrld', flds: 'Hello Worrld\x1fTest', fieldsJson: { Front: 'Hello Worrld', Back: 'Test' } },
        { id: 4, sfld: 'Goodbye', flds: 'Goodbye\x1fTest', fieldsJson: { Front: 'Goodbye', Back: 'Test' } },
      ];

      const threshold = 0.8;
      const result = service.findSimilarDuplicates(notes as any, 'Front', threshold);

      // Notes 1 and 2 are identical (1.0)
      // Notes 1 and 3 are similar (~0.92)
      // Should find groups
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return empty when threshold is too high', () => {
      const notes = [
        { id: 1, sfld: 'Hello', flds: 'Hello\x1fWorld', fieldsJson: { Front: 'Hello', Back: 'World' } },
        { id: 2, sfld: 'Hallo', flds: 'Hallo\x1fWorld', fieldsJson: { Front: 'Hallo', Back: 'World' } },
      ];

      const threshold = 1.0; // Only exact matches
      const result = service.findSimilarDuplicates(notes as any, 'Front', threshold);

      expect(result.length).toBe(0);
    });
  });
});
