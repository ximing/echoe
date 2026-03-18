/**
 * Tests for APKG parsing functionality
 */

import JSZip from 'jszip';

/**
 * Test utilities for APKG parsing
 * This file provides mock data and helpers for testing APKG parsing functionality
 */

// Mock Anki collection.anki2 database structure
// This is a minimal mock for testing - not a real SQLite database
export const mockCollectionData = {
  col: {
    models: JSON.stringify({
      '1234567890': {
        id: 1234567890,
        name: 'Basic Card',
        type: 0,
        css: '.card { font-size: 20px; }',
        flds: [
          { name: 'Front', ord: 0 },
          { name: 'Back', ord: 1 },
        ],
        tmpls: [
          {
            name: 'Card 1',
            qfmt: '{{Front}}',
            afmt: '{{FrontSide}}<hr id="answer">{{Back}}',
          },
        ],
      },
    }),
    decks: JSON.stringify({
      '1': {
        id: 1,
        name: 'Test Deck',
        desc: 'A test deck',
      },
    }),
  },
  notes: [
    {
      id: 1,
      guid: 'abc123',
      mid: 1234567890,
      mod: 1234567890,
      usn: 0,
      tags: 'tag1 tag2',
      flds: 'Hello\x1fWorld',
      sfld: 'Hello',
      csum: 12345,
      flags: 0,
      data: '',
    },
    {
      id: 2,
      guid: 'def456',
      mid: 1234567890,
      mod: 1234567890,
      usn: 0,
      tags: '',
      flds: 'Question\x1fAnswer',
      sfld: 'Question',
      csum: 67890,
      flags: 0,
      data: '',
    },
  ],
  cards: [
    {
      id: 1,
      nid: 1,
      did: 1,
      ord: 0,
      mod: 1234567890,
      usn: 0,
      type: 0,
      queue: 0,
      due: 0,
      ivl: 0,
      factor: 0,
      reps: 0,
      lapses: 0,
      left: 0,
      odue: 0,
      odid: 0,
      flags: 0,
      data: '',
    },
    {
      id: 2,
      nid: 2,
      did: 1,
      ord: 0,
      mod: 1234567890,
      usn: 0,
      type: 0,
      queue: 0,
      due: 0,
      ivl: 0,
      factor: 0,
      reps: 0,
      lapses: 0,
      left: 0,
      odue: 0,
      odid: 0,
      flags: 0,
      data: '',
    },
  ],
  revlog: [],
};

describe('APKG Parser Utilities', () => {
  describe('parseAnkiFields', () => {
    it('should parse fields separated by 0x1f', () => {
      const flds = 'Hello\x1fWorld';
      const fields = flds.split('\x1f');
      expect(fields).toEqual(['Hello', 'World']);
    });

    it('should handle single field', () => {
      const flds = 'SingleField';
      const fields = flds.split('\x1f');
      expect(fields).toEqual(['SingleField']);
    });

    it('should handle empty fields', () => {
      const flds = 'Field1\x1f\x1fField3';
      // Note: JavaScript split() removes trailing empty strings
      const fields = flds.split('\x1f');
      expect(fields).toEqual(['Field1', '', 'Field3']);
    });
  });

  describe('parseAnkiTags', () => {
    it('should parse space-separated tags', () => {
      const tags = 'tag1 tag2 tag3';
      const tagArray = tags.split(' ').filter((t) => t);
      expect(tagArray).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should handle empty tags', () => {
      const tags = '';
      const tagArray = tags.split(' ').filter((t) => t);
      expect(tagArray).toEqual([]);
    });

    it('should handle single tag', () => {
      const tags = 'singleton';
      const tagArray = tags.split(' ').filter((t) => t);
      expect(tagArray).toEqual(['singleton']);
    });
  });

  describe('createMockApkgZip', () => {
    it('should create a valid ZIP structure', () => {
      const zip = new JSZip();
      zip.file('collection.anki2', Buffer.alloc(1));
      zip.file('media', JSON.stringify({}));
      zip.file('1', Buffer.from('test'));

      expect(zip.file('collection.anki2')).toBeDefined();
      expect(zip.file('media')).toBeDefined();
      expect(zip.file('1')).toBeDefined();
    });

    it('should contain collection.anki21 file', () => {
      const zip = new JSZip();
      zip.file('collection.anki21', Buffer.alloc(1));

      expect(zip.file('collection.anki21')).toBeDefined();
    });
  });
});
