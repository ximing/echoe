import { Service } from '@rabjs/react';
import JSZip from 'jszip';
import initSqlJs, { type Database } from 'sql.js';
import sqlWasmBrowserUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/**
 * Anki APKG Parser Service
 * Parses Anki .apkg files in the browser using JSZip and sql.js
 */
export class ApkgParserService extends Service {
  // State
  isLoading = false;
  error: string | null = null;

  // Parsed data
  database: Database | null = null;
  mediaMapping: Record<string, string> = {}; // numeric filename -> original filename
  mediaFiles: Map<string, Blob> = new Map(); // numeric filename -> file blob
  private reverseMediaMapping: Map<string, string> = new Map(); // originalName → numericName

  // Parsed Anki data
  notes: AnkiNote[] = [];
  cards: AnkiCard[] = [];
  models: AnkiModel[] = [];
  decks: AnkiDeck[] = [];
  revlog: AnkiRevlog[] = [];

  /**
   * Parse an .apkg file
   */
  async parseApkgFile(file: File): Promise<boolean> {
    this.isLoading = true;
    this.error = null;
    this.reset();

    try {
      // Resolve wasm from Vite bundled asset to avoid runtime CDN failures.
      const SQL = await initSqlJs({
        locateFile: (file: string) => {
          if (file === 'sql-wasm.wasm' || file === 'sql-wasm-debug.wasm') {
            return sqlWasmUrl;
          }
          if (file === 'sql-wasm-browser.wasm' || file === 'sql-wasm-browser-debug.wasm') {
            return sqlWasmBrowserUrl;
          }
          // Fallback for potential future sql.js wasm filenames.
          if (file.endsWith('.wasm')) {
            return sqlWasmBrowserUrl;
          }
          return file;
        },
      });

      // Unzip the .apkg file
      const zip = await JSZip.loadAsync(file);

      // Find and extract SQLite database (collection.anki21 or collection.anki2)
      const dbFile = zip.file('collection.anki21') || zip.file('collection.anki2');
      if (!dbFile) {
        throw new Error('No collection database found in .apkg file');
      }

      const dbBuffer = await dbFile.async('uint8array');
      this.database = new SQL.Database(dbBuffer);

      // Parse media mapping
      const mediaFile = zip.file('media');
      if (mediaFile) {
        const mediaJson = await mediaFile.async('text');
        this.mediaMapping = JSON.parse(mediaJson);
      }

      // Build reverse mapping: originalName -> numericName
      for (const [numericName, originalName] of Object.entries(this.mediaMapping)) {
        this.reverseMediaMapping.set(originalName, numericName);
      }

      // Extract media files
      for (const [numericName] of Object.entries(this.mediaMapping)) {
        const mediaFileEntry = zip.file(numericName);
        if (mediaFileEntry) {
          const blob = await mediaFileEntry.async('blob');
          this.mediaFiles.set(numericName, blob);
        }
      }

      // Parse database tables
      this.parseNotes();
      this.parseCards();
      this.parseModels();
      this.parseDecks();
      this.parseRevlog();

      return true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to parse .apkg file';
      console.error('APKG parsing error:', err);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Parse notes from the database
   */
  private parseNotes(): void {
    if (!this.database) return;

    const result = this.database.exec('SELECT id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data FROM notes');
    if (result.length === 0) return;

    const rows = result[0].values;
    this.notes = rows.map((row: unknown[]) => ({
      id: row[0] as number,
      guid: row[1] as string,
      mid: row[2] as number, // model id
      mod: row[3] as number, // modification timestamp
      usn: row[4] as number,
      tags: row[5] as string,
      flds: row[6] as string, // fields separated by \x1f
      sfld: row[7] as string, // sort field
      csum: row[8] as number,
      flags: row[9] as number,
      data: row[10] as string,
    }));
  }

  /**
   * Parse cards from the database
   */
  private parseCards(): void {
    if (!this.database) return;

    const result = this.database.exec('SELECT id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data FROM cards');
    if (result.length === 0) return;

    const rows = result[0].values;
    this.cards = rows.map((row: unknown[]) => ({
      id: row[0] as number,
      nid: row[1] as number, // note id
      did: row[2] as number, // deck id
      ord: row[3] as number, // ordinal (which card template)
      mod: row[4] as number,
      usn: row[5] as number,
      type: row[6] as number, // 0=new, 1=learning, 2=review, 3=relearning
      queue: row[7] as number,
      due: row[8] as number,
      ivl: row[9] as number, // interval in days
      factor: row[10] as number, // ease factor (2500 = 250%)
      reps: row[11] as number, // number of reviews
      lapses: row[12] as number,
      left: row[13] as number,
      odue: row[14] as number,
      odid: row[15] as number,
      flags: row[16] as number,
      data: row[17] as string,
    }));
  }

  /**
   * Parse models (note types) from the database
   */
  private parseModels(): void {
    if (!this.database) return;

    const result = this.database.exec('SELECT models FROM col');
    if (result.length === 0) return;

    const modelsJson = result[0].values[0][0] as string;
    const modelsObj = JSON.parse(modelsJson) as Record<string, unknown>;

    this.models = Object.values(modelsObj).map((model) => {
      const m = model as Record<string, unknown>;
      return {
        id: m.id as number,
        name: m.name as string,
        type: m.type as number, // 0=standard, 1=cloze
        css: m.css as string,
        flds: m.flds as AnkiFieldDefinition[], // field definitions
        tmpls: m.tmpls as AnkiTemplateDefinition[], // card templates (qfmt, afmt)
        sortf: m.sortf as number,
        did: m.did as number,
        mod: m.mod as number,
      };
    });
  }

  /**
   * Parse decks from the database
   */
  private parseDecks(): void {
    if (!this.database) return;

    const result = this.database.exec('SELECT decks FROM col');
    if (result.length === 0) return;

    const decksJson = result[0].values[0][0] as string;
    const decksObj = JSON.parse(decksJson) as Record<string, unknown>;

    this.decks = Object.values(decksObj)
      .map((deck) => {
        const d = deck as Record<string, unknown>;
        return {
          id: d.id as number,
          name: d.name as string,
          desc: d.desc as string,
          mod: d.mod as number,
          collapsed: d.collapsed as boolean,
          conf: d.conf as number,
        };
      })
      // Sort: non-Default decks first, then Default deck last
      .sort((a, b) => {
        if (a.id === 1) return 1; // Default deck goes last
        if (b.id === 1) return -1;
        return 0; // Keep original order for other decks
      });
  }

  /**
   * Parse review log from the database
   */
  private parseRevlog(): void {
    if (!this.database) return;

    const result = this.database.exec('SELECT id, cid, usn, ease, ivl, lastIvl, factor, time, type FROM revlog');
    if (result.length === 0) return;

    const rows = result[0].values;
    this.revlog = rows.map((row: unknown[]) => ({
      id: row[0] as number, // timestamp in milliseconds
      cid: row[1] as number, // card id
      usn: row[2] as number,
      ease: row[3] as number, // 1=Again, 2=Hard, 3=Good, 4=Easy
      ivl: row[4] as number, // interval in days (negative = seconds for learning)
      lastIvl: row[5] as number,
      factor: row[6] as number, // ease factor
      time: row[7] as number, // time taken in milliseconds
      type: row[8] as number, // 0=learning, 1=review, 2=relearn, 3=filtered, 4=manual
    }));
  }

  /**
   * Get media file by original filename (e.g., "youdao-xxx.mp3")
   */
  public getMediaFileByOriginalName(originalName: string): Blob | undefined {
    const numericName = this.reverseMediaMapping.get(originalName);
    return numericName ? this.mediaFiles.get(numericName) : undefined;
  }

  /**
   * Extract media references from HTML content (e.g., [sound:file.mp3])
   */
  public extractMediaReferences(html: string): string[] {
    const regex = /\[sound:([^\]]+)\]/g;
    const matches: string[] = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      matches.push(match[1]);
    }
    return matches;
  }

  /**
   * Parse hierarchical deck name (e.g., "Parent::Child")
   */
  public parseDeckHierarchy(deckName: string): { parent: string | null; name: string } {
    const parts = deckName.split('::');
    if (parts.length === 1) {
      return { parent: null, name: deckName };
    }
    return {
      parent: parts.slice(0, -1).join('::'),
      name: parts[parts.length - 1]
    };
  }

  /**
   * Get full deck path as array (e.g., ["Parent", "Child"])
   */
  public getDeckPath(deckName: string): string[] {
    return deckName.split('::');
  }

  /**
   * Split note fields into array
   */
  public splitFields(note: AnkiNote): string[] {
    return note.flds.split('\x1f');
  }

  /**
   * Split tags into array
   */
  public splitTags(note: AnkiNote): string[] {
    return note.tags.trim().split(/\s+/).filter(Boolean);
  }

  /**
   * Get field names for a note's model
   */
  public getFieldNames(note: AnkiNote): string[] {
    const model = this.models.find(m => m.id === note.mid);
    return model?.flds.map((f) => f.name) || [];
  }

  /**
   * Map field values to field names
   */
  public getFieldMap(note: AnkiNote): Record<string, string> {
    const fieldNames = this.getFieldNames(note);
    const fieldValues = this.splitFields(note);
    return Object.fromEntries(
      fieldNames.map((name, i) => [name, fieldValues[i] || ''])
    );
  }

  /**
   * Get media file by numeric name
   */
  getMediaFile(numericName: string): Blob | undefined {
    return this.mediaFiles.get(numericName);
  }

  /**
   * Get original filename for a numeric media filename
   */
  getOriginalFilename(numericName: string): string | undefined {
    return this.mediaMapping[numericName];
  }

  /**
   * Reset all parsed data
   */
  reset(): void {
    this.database?.close();
    this.database = null;
    this.mediaMapping = {};
    this.mediaFiles.clear();
    this.reverseMediaMapping.clear();
    this.notes = [];
    this.cards = [];
    this.models = [];
    this.decks = [];
    this.revlog = [];
    this.error = null;
  }
}

// Type definitions for Anki data structures

export interface AnkiNote {
  id: number;
  guid: string;
  mid: number; // model id
  mod: number; // modification timestamp
  usn: number;
  tags: string;
  flds: string; // fields separated by \x1f
  sfld: string; // sort field
  csum: number;
  flags: number;
  data: string;
}

export interface AnkiCard {
  id: number;
  nid: number; // note id
  did: number; // deck id
  ord: number; // ordinal (which card template)
  mod: number;
  usn: number;
  type: number; // 0=new, 1=learning, 2=review, 3=relearning
  queue: number;
  due: number;
  ivl: number; // interval in days
  factor: number; // ease factor (2500 = 250%)
  reps: number; // number of reviews
  lapses: number;
  left: number;
  odue: number;
  odid: number;
  flags: number;
  data: string;
}

export interface AnkiFieldDefinition {
  name: string;
  ord: number;
  sticky: boolean;
  rtl: boolean;
  font: string;
  size: number;
}

export interface AnkiTemplateDefinition {
  name: string;
  qfmt: string;
  afmt: string;
  ord: number;
}

export interface AnkiModel {
  id: number;
  name: string;
  type: number; // 0=standard, 1=cloze
  css: string;
  flds: AnkiFieldDefinition[]; // field definitions
  tmpls: AnkiTemplateDefinition[]; // card templates (qfmt, afmt)
  sortf: number;
  did: number;
  mod: number;
}

export interface AnkiDeck {
  id: number;
  name: string;
  desc: string;
  mod: number;
  collapsed: boolean;
  conf: number;
}

export interface AnkiRevlog {
  id: number; // timestamp in milliseconds
  cid: number; // card id
  usn: number;
  ease: number; // 1=Again, 2=Hard, 3=Good, 4=Easy
  ivl: number; // interval in days (negative = seconds for learning)
  lastIvl: number;
  factor: number; // ease factor
  time: number; // time taken in milliseconds
  type: number; // 0=learning, 1=review, 2=relearn, 3=filtered, 4=manual
}
