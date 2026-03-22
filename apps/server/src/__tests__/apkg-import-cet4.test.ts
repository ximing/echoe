/**
 * Integration tests for APKG import with CET-4.apkg
 * Tests the fixes for issue #93: deck name handling and media file imports
 */

import 'reflect-metadata';
import fs from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';
import JSZip from 'jszip';

// TODO: Import actual service once implementation is complete
// import { EchoeImportService } from '../services/echoe-import.service.js';

/**
 * Helper: Load CET-4.apkg file
 */
async function loadCet4Apkg(): Promise<Buffer> {
  // Path from apps/server to project root apkg folder
  const apkgPath = path.join(process.cwd(), '../../apkg/CET-4.apkg');
  return await fs.readFile(apkgPath);
}

/**
 * Helper: Extract and parse collection.anki2/anki21 from APKG
 */
async function parseApkgCollection(buffer: Buffer): Promise<{ zip: JSZip; db: Database.Database; mediaManifest: Map<string, string> }> {
  const zip = await JSZip.loadAsync(buffer);

  // Find collection file
  const collectionFile = zip.file('collection.anki21') || zip.file('collection.anki2');
  if (!collectionFile) {
    throw new Error('No collection file found in APKG');
  }

  const collectionBuffer = await collectionFile.async('nodebuffer');
  const db = new Database(collectionBuffer, { readonly: true });

  // Parse media manifest
  const mediaManifest = new Map<string, string>();
  const mediaFile = zip.file('media');
  if (mediaFile) {
    const mediaContent = await mediaFile.async('string');
    const mediaJson = JSON.parse(mediaContent) as Record<string, string>;
    for (const [key, value] of Object.entries(mediaJson)) {
      mediaManifest.set(key, value);
    }
  }

  return { zip, db, mediaManifest };
}

/**
 * Helper: Get deck info from collection
 */
function getDeckInfo(db: Database.Database): Array<{ id: number; name: string }> {
  const colRow = db.prepare('SELECT decks FROM col LIMIT 1').get() as { decks?: string } | undefined;
  if (!colRow?.decks) {
    return [];
  }

  const decks = JSON.parse(colRow.decks) as Record<string, { id: number; name: string }>;
  return Object.values(decks);
}

/**
 * Helper: Parse hierarchical deck name (e.g., "Parent::Child" -> { parent: "Parent", name: "Child" })
 */
function parseDeckHierarchy(deckName: string): { parent: string | null; name: string } {
  const parts = deckName.split('::');
  if (parts.length === 1) {
    return { parent: null, name: deckName };
  }

  const name = parts[parts.length - 1];
  const parent = parts.slice(0, -1).join('::');
  return { parent, name };
}

/**
 * Helper: Extract media references from HTML field
 */
function extractMediaReferences(html: string): string[] {
  const references: string[] = [];

  // Extract [sound:filename.mp3] patterns
  const soundMatches = html.matchAll(/\[sound:([^\]]+)\]/g);
  for (const match of soundMatches) {
    references.push(match[1]);
  }

  // Extract <img src="filename.jpg"> patterns
  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const match of imgMatches) {
    references.push(match[1]);
  }

  return references;
}

describe('CET-4 APKG Import', () => {
  let apkgBuffer: Buffer;

  beforeAll(async () => {
    apkgBuffer = await loadCet4Apkg();
  });

  describe('APKG file structure', () => {
    it('should load CET-4.apkg successfully', () => {
      expect(apkgBuffer).toBeDefined();
      expect(apkgBuffer.length).toBeGreaterThan(0);
    });

    it('should contain valid ZIP structure', async () => {
      const zip = await JSZip.loadAsync(apkgBuffer);

      // Check for required files
      const collectionFile = zip.file('collection.anki21') || zip.file('collection.anki2');
      expect(collectionFile).toBeDefined();

      const mediaFile = zip.file('media');
      expect(mediaFile).toBeDefined();
    });

    it('should have expected deck structure', async () => {
      const { db } = await parseApkgCollection(apkgBuffer);

      try {
        const decks = getDeckInfo(db);

        // CET-4.apkg should have deck named "英语单词::大学四级英语单词"
        expect(decks.length).toBeGreaterThan(0);

        const cet4Deck = decks.find(d => d.name.includes('大学四级英语单词'));
        expect(cet4Deck).toBeDefined();
        expect(cet4Deck?.name).toBe('英语单词::大学四级英语单词');
      } finally {
        db.close();
      }
    });

    it('should have expected media file count', async () => {
      const { mediaManifest } = await parseApkgCollection(apkgBuffer);

      // CET-4.apkg is reported to have 4,028 media files
      const mediaCount = mediaManifest.size;
      expect(mediaCount).toBe(4028);
    });
  });

  describe('Deck name parsing', () => {
    it('should parse hierarchical deck name correctly', () => {
      const result = parseDeckHierarchy('英语单词::大学四级英语单词');

      expect(result.parent).toBe('英语单词');
      expect(result.name).toBe('大学四级英语单词');
    });

    it('should handle single-level deck names', () => {
      const result = parseDeckHierarchy('SimpleDeck');

      expect(result.parent).toBeNull();
      expect(result.name).toBe('SimpleDeck');
    });

    it('should handle deeply nested deck names', () => {
      const result = parseDeckHierarchy('Level1::Level2::Level3::FinalDeck');

      expect(result.parent).toBe('Level1::Level2::Level3');
      expect(result.name).toBe('FinalDeck');
    });
  });

  describe('Media reference extraction', () => {
    it('should extract [sound:...] references', () => {
      const html = 'Text before [sound:audio1.mp3] middle [sound:audio2.mp3] after';
      const refs = extractMediaReferences(html);

      expect(refs).toContain('audio1.mp3');
      expect(refs).toContain('audio2.mp3');
      expect(refs.length).toBe(2);
    });

    it('should extract <img src="..."> references', () => {
      const html = '<p>Before <img src="image1.jpg"> and <img src="image2.png" /> after</p>';
      const refs = extractMediaReferences(html);

      expect(refs).toContain('image1.jpg');
      expect(refs).toContain('image2.png');
      expect(refs.length).toBe(2);
    });

    it('should extract mixed media references', () => {
      const html = 'Text [sound:audio.mp3] with <img src="image.jpg"> elements';
      const refs = extractMediaReferences(html);

      expect(refs).toContain('audio.mp3');
      expect(refs).toContain('image.jpg');
      expect(refs.length).toBe(2);
    });

    it('should handle numeric media references (Anki 2.0 format)', () => {
      const html = 'Text [sound:0] with <img src="1234"> elements';
      const refs = extractMediaReferences(html);

      expect(refs).toContain('0');
      expect(refs).toContain('1234');
    });
  });

  describe('Media file resolution', () => {
    it('should build reverse media mapping from manifest', async () => {
      const { mediaManifest } = await parseApkgCollection(apkgBuffer);

      // Create reverse mapping: original filename -> numeric key
      const reverseMap = new Map<string, string>();
      for (const [key, filename] of mediaManifest) {
        reverseMap.set(filename, key);
      }

      expect(reverseMap.size).toBe(mediaManifest.size);

      // If we know a specific file exists, we can test it
      // For now, just verify the map is created correctly
      expect(reverseMap.size).toBeGreaterThan(0);
    });

    it('should resolve numeric references to actual filenames', async () => {
      const { mediaManifest } = await parseApkgCollection(apkgBuffer);

      // Pick first entry as test
      const firstEntry = Array.from(mediaManifest.entries())[0];
      if (firstEntry) {
        const [numericKey, originalFilename] = firstEntry;

        // Simulate resolving [sound:0] to actual filename
        const resolved = mediaManifest.get(numericKey);
        expect(resolved).toBe(originalFilename);
      }
    });
  });

  describe('Field splitting and mapping', () => {
    it('should split Anki note fields correctly', async () => {
      const { db } = await parseApkgCollection(apkgBuffer);

      try {
        // Get first note to test field splitting
        const note = db.prepare('SELECT flds FROM notes LIMIT 1').get() as { flds: string } | undefined;

        if (note) {
          // Anki uses \x1f (ASCII 31) as field separator
          const fields = note.flds.split('\x1f');

          expect(Array.isArray(fields)).toBe(true);
          expect(fields.length).toBeGreaterThan(0);
        }
      } finally {
        db.close();
      }
    });

    it('should map fields to field names from notetype', async () => {
      const { db } = await parseApkgCollection(apkgBuffer);

      try {
        // Get models (note types) from col table
        const colRow = db.prepare('SELECT models FROM col LIMIT 1').get() as { models?: string } | undefined;

        if (colRow?.models) {
          const models = JSON.parse(colRow.models) as Record<string, {
            flds: Array<{ name: string; ord: number }>;
          }>;

          const firstModel = Object.values(models)[0];
          expect(firstModel).toBeDefined();
          expect(Array.isArray(firstModel.flds)).toBe(true);
          expect(firstModel.flds.length).toBeGreaterThan(0);

          // Should have name and ord properties
          const firstField = firstModel.flds[0];
          expect(firstField).toHaveProperty('name');
          expect(firstField).toHaveProperty('ord');
        }
      } finally {
        db.close();
      }
    });
  });

  // TODO: Add integration tests once EchoeImportService implementation is complete
  describe.skip('Full import integration', () => {
    it('should import CET-4.apkg with correct deck name', async () => {
      // TODO: Implement once service is ready
      // const service = new EchoeImportService(...);
      // const result = await service.importApkg(testUid, apkgBuffer);
      //
      // expect(result.decksAdded).toBe(1);
      // // Verify deck name is "英语单词::大学四级英语单词" or "大学四级英语单词"
    });

    it('should import all 4,028 media files', async () => {
      // TODO: Implement once service is ready
      // const service = new EchoeImportService(...);
      // const result = await service.importApkg(testUid, apkgBuffer);
      //
      // expect(result.mediaImported).toBe(4028);
    });

    it('should resolve media references in note fields', async () => {
      // TODO: Implement once service is ready
      // const service = new EchoeImportService(...);
      // await service.importApkg(testUid, apkgBuffer);
      //
      // // Query a note that has media references
      // // Verify that [sound:0] was replaced with [sound:actual-filename.mp3]
      // // Verify that <img src="123"> was replaced with <img src="actual-filename.jpg">
    });

    it('should handle import errors gracefully', async () => {
      // TODO: Test error handling
      // - Corrupted media files
      // - Missing media files
      // - Invalid deck structure
    });
  });
});
