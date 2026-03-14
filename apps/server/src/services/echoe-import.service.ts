/**
 * Echoe Import Service
 * Handles importing .apkg files (both Standard Anki and Echoe Legacy formats)
 */

import Database from 'better-sqlite3';
import JSZip from 'jszip';
import { Service, Inject } from 'typedi';
import { eq, and } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { echoeNotes, type NewEchoeNotes } from '../db/schema/echoe-notes.js';
import { echoeCards, type NewEchoeCards } from '../db/schema/echoe-cards.js';
import { echoeRevlog, type NewEchoeRevlog } from '../db/schema/echoe-revlog.js';
import { echoeDecks, type NewEchoeDecks } from '../db/schema/echoe-decks.js';
import { echoeNotetypes, type NewEchoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { EchoeMediaService } from './echoe-media.service.js';
import { logger } from '../utils/logger.js';
import { normalizeNoteFields } from '../lib/note-field-normalizer.js';

export interface ImportResultDto {
  notesAdded: number;
  notesUpdated: number;
  notesSkipped: number;
  cardsAdded: number;
  cardsUpdated: number;
  decksAdded: number;
  notetypesAdded: number;
  revlogImported: number;
  mediaImported: number;
  errors: string[];
  errorDetails?: ImportErrorDetail[];
  fsrsBackfilledFromRevlog?: number;
  fsrsNewCards?: number;
  fsrsHeuristic?: number;
}

type PackageType = 'standard-anki' | 'echoe-legacy' | 'unknown';

interface ImportErrorDetail {
  category: 'notetype' | 'deck' | 'note' | 'card' | 'revlog' | 'media' | 'general';
  message: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SECOND_MS = 1000;
const LEGACY_DAY_DUE_MAX = 10_000_000;
const LEGACY_SECOND_DUE_MAX = 100_000_000_000;
const REVLOG_ID_MICROSECOND_MIN = 100_000_000_000_000;
const REVLOG_ID_MILLISECOND_MIN = 100_000_000_000;
const FSRS_DIFFICULTY_FALLBACK = 2.5;

interface EchoeDeckRow {
  id: number;
  name: string;
  mtime: number;
  mod: number;
  usn: number;
  collapsed: number;
  dyn: number;
  desc: string;
  conf: number;
  extendNew: number;
  extendRev: number;
  did: number;
  lim: number;
  mid: number;
}

interface EchoeNoteRow {
  id: number;
  guid: string;
  mid: number;
  mod: number;
  usn: number;
  tags: string;
  flds: string;
  sfld: string;
  csum: number;
  flags: number;
  data: string;
}

interface EchoeCardRow {
  id: number;
  nid: number;
  did: number;
  ord: number;
  mod: number;
  usn: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  left: number;
  odue: number;
  odid: number;
  flags: number;
  data: string;
}

interface EchoeRevlogRow {
  id: number;
  cid: number;
  usn: number;
  ease: number;
  ivl: number;
  lastIvl: number;
  factor: number;
  time: number;
  type: number;
}

interface EchoeNotetypeRow {
  id: number;
  name: string;
  mtime: number;
  mod: number;
  usn: number;
  sortf: number;
  did: number;
  tmpls: string;
  flds: string;
  css: string;
  type: number;
  latexPre: string;
  latexPost: string;
  req: string;
}

@Service()
export class EchoeImportService {
  constructor(@Inject(() => EchoeMediaService) private mediaService: EchoeMediaService) {}

  /**
   * Detect the package type (Standard Anki vs Echoe Legacy)
   * Priority: Official Anki uses collection.anki2/anki21 as primary source.
   */
  private async detectPackageType(zip: JSZip): Promise<PackageType> {
    // Check for collection.anki21/anki2 first (official Anki format)
    const collectionFile = zip.file('collection.anki21') || zip.file('collection.anki2');
    if (collectionFile) {
      // Try to read the collection and check for custom tables
      try {
        const collectionBuffer = await collectionFile.async('nodebuffer');
        const db = new Database(collectionBuffer, { readonly: true });

        // Check for legacy Echoe tables
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
        const tableNames = tables.map(t => t.name);

        // Check for Echoe-specific tables (notetypes, decks, notes, cards, revlog)
        const hasEchoeTables = ['notetypes', 'decks', 'notes', 'cards', 'revlog'].every(t => tableNames.includes(t));
        db.close();

        if (hasEchoeTables) {
          return 'echoe-legacy';
        }
        // If no Echoe tables, this is standard Anki
        return 'standard-anki';
      } catch {
        // If we can't read the DB, check for col.json as fallback
        const colJson = zip.file('col.json');
        if (colJson) {
          return 'standard-anki';
        }
      }
    }

    // Check for col.json (legacy Standard Anki format, less common now)
    const colJson = zip.file('col.json');
    if (colJson) {
      return 'standard-anki';
    }

    // Default to standard Anki if we can't determine
    return 'standard-anki';
  }

  /**
   * Import an .apkg file
   */
  async importApkg(uid: string, buffer: Buffer): Promise<ImportResultDto> {
    const result: ImportResultDto = {
      notesAdded: 0,
      notesUpdated: 0,
      notesSkipped: 0,
      cardsAdded: 0,
      cardsUpdated: 0,
      decksAdded: 0,
      notetypesAdded: 0,
      revlogImported: 0,
      mediaImported: 0,
      errors: [],
    };

    try {
      // Unzip the .apkg file
      const zip = await JSZip.loadAsync(buffer);

      // Detect package type
      const packageType = await this.detectPackageType(zip);
      logger.info(`Detected package type: ${packageType}`);

      if (packageType === 'standard-anki') {
        return await this.importStandardAnki(uid, zip, result);
      } else {
        return await this.importLegacyEchoe(uid, zip, result);
      }
    } catch (error) {
      logger.error('Import error:', error);
      result.errors.push(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Import Standard Anki APKG format
   * Supports both official format (collection.anki2/anki21) and legacy col.json.
   */
  private async importStandardAnki(uid: string, zip: JSZip, result: ImportResultDto): Promise<ImportResultDto> {
    try {
      // Find the collection file (required for Standard Anki)
      const collectionFile = zip.file('collection.anki21') || zip.file('collection.anki2');
      if (!collectionFile) {
        result.errors.push('No collection file found in .apkg');
        return result;
      }

      const collectionBuffer = await collectionFile.async('nodebuffer');
      const db = new Database(collectionBuffer, { readonly: true });

      // Read col.json if exists (optional, for backwards compatibility)
      const colJsonFile = zip.file('col.json');
      let col: Record<string, unknown> = {};
      if (colJsonFile) {
        try {
          const colJsonContent = await colJsonFile.async('string');
          col = JSON.parse(colJsonContent);
        } catch {
          logger.warn('Failed to parse col.json, using collection database instead');
        }
      }

      // If col.json doesn't have models/decks, try to read from collection database
      // Note: Official Anki stores models/decks in the 'col' table as JSON
      if (!col.models || !col.decks) {
        try {
          const colRow = db.prepare('SELECT models, decks FROM col LIMIT 1').get() as { models?: string; decks?: string } | undefined;
          if (colRow) {
            if (colRow.models && !col.models) {
              col.models = JSON.parse(colRow.models);
            }
            if (colRow.decks && !col.decks) {
              col.decks = JSON.parse(colRow.decks);
            }
          }
        } catch {
          // col table may not exist in some packages
          logger.warn('Could not read models/decks from collection database');
        }
      }

      // Read media manifest
      const mediaManifest = await this.parseMediaManifest(zip);

      try {
        // Import notetypes from col.models
        const notetypeResult = await this.importNotetypesFromColJson(uid, col);
        result.notetypesAdded = notetypeResult.added;
        result.errors.push(...notetypeResult.errors);

        // Import decks from col.decks
        const deckResult = await this.importDecksFromColJson(uid, col);
        result.decksAdded = deckResult.added;
        result.errors.push(...deckResult.errors);

        // Import notes from SQLite
        const noteResult = await this.importNotesFromStandardAnki(uid, db, col, mediaManifest);
        result.notesAdded = noteResult.added;
        result.notesUpdated = noteResult.updated;
        result.notesSkipped = noteResult.skipped;
        result.errors.push(...noteResult.errors);

        // Import cards from SQLite with FSRS backfill
        const cardResult = await this.importCardsFromStandardAnki(uid, db, col);
        result.cardsAdded = cardResult.added;
        result.cardsUpdated = cardResult.updated;
        result.errors.push(...cardResult.errors);
        // FSRS backfill stats
        result.fsrsBackfilledFromRevlog = cardResult.fsrsBackfilledFromRevlog;
        result.fsrsNewCards = cardResult.fsrsNewCards;
        result.fsrsHeuristic = cardResult.fsrsHeuristic;

        // Import revlog
        const revlogResult = await this.importRevlogFromStandardAnki(uid, db);
        result.revlogImported = revlogResult;

        // Import media files
        const mediaResult = await this.importMediaFromStandardAnki(uid, zip, mediaManifest);
        result.mediaImported = mediaResult;
      } finally {
        db.close();
      }
    } catch (error) {
      logger.error('Standard Anki import error:', error);
      result.errors.push(`Standard Anki import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Import Echoe Legacy format
   */
  private async importLegacyEchoe(uid: string, zip: JSZip, result: ImportResultDto): Promise<ImportResultDto> {
    // Find the collection file (collection.anki21 or collection.anki2)
    let collectionFile = zip.file('collection.anki21');
    if (!collectionFile) {
      collectionFile = zip.file('collection.anki2');
    }
    if (!collectionFile) {
      result.errors.push('No collection file found in .apkg');
      return result;
    }

    // Get the collection as a buffer
    const collectionBuffer = await collectionFile.async('nodebuffer');

    // Open the SQLite database
    const db = new Database(collectionBuffer, { readonly: true });

    try {
      // Import notetypes first
      const notetypeResult = await this.importNotetypes(uid, db);
      result.notetypesAdded = notetypeResult.added;
      result.errors.push(...notetypeResult.errors);

      // Import decks
      const deckResult = await this.importDecks(uid, db);
      result.decksAdded = deckResult.added;
      result.errors.push(...deckResult.errors);

      // Import notes
      const noteResult = await this.importNotes(uid, db);
      result.notesAdded = noteResult.added;
      result.notesUpdated = noteResult.updated;
      result.notesSkipped = noteResult.skipped;
      result.errors.push(...noteResult.errors);

      // Import cards
      const cardResult = await this.importCards(uid, db);
      result.cardsAdded = cardResult.added;
      result.cardsUpdated = cardResult.updated;
      result.errors.push(...cardResult.errors);
      // FSRS backfill stats
      result.fsrsBackfilledFromRevlog = cardResult.fsrsBackfilledFromRevlog;
      result.fsrsNewCards = cardResult.fsrsNewCards;
      result.fsrsHeuristic = cardResult.fsrsHeuristic;

      // Import revlog
      const revlogResult = await this.importRevlog(uid, db);
      result.revlogImported = revlogResult;

      // Import media files
      const mediaResult = await this.importMedia(uid, zip);
      result.mediaImported = mediaResult;
    } finally {
      db.close();
    }

    return result;
  }

  /**
   * Parse media manifest for Standard Anki (media 2.0 format)
   */
  private async parseMediaManifest(zip: JSZip): Promise<Map<string, string>> {
    const mediaMap = new Map<string, string>();

    // Check for media 2.0 manifest
    const media2File = zip.file('media');
    if (media2File) {
      try {
        const mediaContent = await media2File.async('string');
        const mediaJson = JSON.parse(mediaContent) as Record<string, string>;

        // Map: number -> original filename
        for (const [key, value] of Object.entries(mediaJson)) {
          mediaMap.set(key, value);
        }
      } catch (error) {
        logger.warn('Failed to parse media manifest:', error);
      }
    }

    return mediaMap;
  }

  /**
   * Import notetypes from col.json
   */
  private async importNotetypesFromColJson(uid: string, col: Record<string, unknown>): Promise<{ added: number; errors: string[] }> {
    const errors: string[] = [];
    let added = 0;

    try {
      const models = col.models as Record<string, {
        id: number;
        name: string;
        flds: string;
        tmpls: string;
        css: string;
        sortf: number;
        did: number;
        type: number;
        mod: number;
        usn: number;
        req: string;
      }>;

      if (!models || typeof models !== 'object') {
        return { added: 0, errors: [] };
      }

      const db = getDatabase();

      for (const [mid, model] of Object.entries(models)) {
        try {
          const modelId = parseInt(mid, 10);

          // Check if notetype already exists in user scope
          const existing = await db
            .select({ id: echoeNotetypes.id })
            .from(echoeNotetypes)
            .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, modelId)))
            .limit(1);

          if (existing.length === 0) {
            // Insert new notetype
            await db.insert(echoeNotetypes).values({
              id: modelId,
              uid,
              name: model.name,
              mod: model.mod || 0,
              usn: model.usn || 0,
              sortf: model.sortf || 0,
              did: model.did || 1,
              tmpls: model.tmpls || '[]',
              flds: model.flds || '[]',
              css: model.css || '',
              type: model.type || 0,
              latexPre: '',
              latexPost: '',
              req: model.req || '[]',
            });
            added++;
          }
        } catch (error) {
          errors.push(`Failed to import notetype ${model?.name || mid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      errors.push(`Failed to read notetypes from col.json: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { added, errors };
  }

  /**
   * Import decks from col.json
   */
  private async importDecksFromColJson(uid: string, col: Record<string, unknown>): Promise<{ added: number; errors: string[] }> {
    const errors: string[] = [];
    let added = 0;

    try {
      const decks = col.decks as Record<string, {
        id: number;
        name: string;
        mod: number;
        usn: number;
        collapsed: boolean;
        desc: string;
        dyn: number;
        conf: number;
      }>;

      if (!decks || typeof decks !== 'object') {
        return { added: 0, errors: [] };
      }

      const db = getDatabase();

      for (const [did, deck] of Object.entries(decks)) {
        try {
          const deckId = parseInt(did, 10);

          // Skip default deck with id=1
          if (deckId === 1) {
            continue;
          }

          // Check if deck already exists in user scope
          const existing = await db
            .select({ id: echoeDecks.id })
            .from(echoeDecks)
            .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.id, deckId)))
            .limit(1);

          if (existing.length === 0) {
            // Insert new deck
            await db.insert(echoeDecks).values({
              id: deckId,
              uid,
              name: deck.name,
              conf: deck.conf || 1,
              extendNew: 20,
              extendRev: 200,
              usn: deck.usn || 0,
              lim: 0,
              collapsed: deck.collapsed ? 1 : 0,
              dyn: deck.dyn || 0,
              mod: deck.mod || 0,
              desc: deck.desc || '',
              mid: 0,
            });
            added++;
          }
        } catch (error) {
          errors.push(`Failed to import deck ${deck?.name || did}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      errors.push(`Failed to read decks from col.json: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { added, errors };
  }

  /**
   * Import notes from Standard Anki SQLite database
   */
  private async importNotesFromStandardAnki(
    uid: string,
    sourceDb: Database.Database,
    col: Record<string, unknown>,
    mediaManifest: Map<string, string>
  ): Promise<{ added: number; updated: number; skipped: number; errors: string[] }> {
    try {
      const rows = sourceDb.prepare('SELECT * FROM notes').all() as EchoeNoteRow[];
      const notetypeFieldsMap = this.buildNotetypeFieldsMapFromColJson(col);
      return await this.importNotesRows(uid, rows, notetypeFieldsMap, mediaManifest);
    } catch (error) {
      return {
        added: 0,
        updated: 0,
        skipped: 0,
        errors: [`Failed to read notes: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Build notetype fields map from col.json models
   */
  private buildNotetypeFieldsMapFromColJson(col: Record<string, unknown>): Map<number, string[]> {
    try {
      const models = col.models as Record<string, { flds: unknown }> | undefined;
      if (!models || typeof models !== 'object') {
        return new Map();
      }

      const rows = Object.entries(models)
        .map(([mid, model]) => ({ id: Number.parseInt(mid, 10), flds: model?.flds }))
        .filter((row) => Number.isFinite(row.id));

      return this.buildNotetypeFieldsMapFromRows(rows);
    } catch {
      return new Map();
    }
  }

  /**
   * Replace media references in field values
   */
  private replaceMediaReferences(value: string, mediaManifest: Map<string, string>): string {
    // Replace patterns like [sound:12345.mp3] with [sound:actual_filename.mp3]
    return value.replace(/\[sound:(\d+)([^\]]*)\]/g, (match, num, ext) => {
      const actualName = mediaManifest.get(num);
      if (actualName) {
        return `[sound:${actualName}]`;
      }
      return match;
    });
  }

  /**
   * Import cards from Standard Anki SQLite database with FSRS backfill
   * FSRS backfill strategy (per PRD FR-7):
   * 1. If card has revlog, use latest revlog entry for FSRS fields
   * 2. If no revlog and card is new (type=0), keep empty state (let study service initialize)
   * 3. If no revlog but card has scheduling data (type=2), use heuristic mapping
   */
  private async importCardsFromStandardAnki(
    uid: string,
    sourceDb: Database.Database,
    _col: Record<string, unknown>
  ): Promise<{ added: number; updated: number; errors: string[]; fsrsBackfilledFromRevlog: number; fsrsNewCards: number; fsrsHeuristic: number }> {
    return this.importCardsRows(uid, sourceDb, 'Could not read revlog for FSRS backfill');
  }

  /**
   * Import revlog from Standard Anki SQLite database
   */
  private async importRevlogFromStandardAnki(uid: string, sourceDb: Database.Database): Promise<number> {
    try {
      const rows = sourceDb.prepare('SELECT * FROM revlog').all() as EchoeRevlogRow[];
      return this.importRevlogRows(uid, rows, { difficultyFallback: FSRS_DIFFICULTY_FALLBACK });
    } catch (error) {
      logger.error('Failed to import revlog:', error);
      return 0;
    }
  }

  /**
   * Import media files from Standard Anki package
   * Supports both official format (numeric filenames + media manifest) and legacy format (media/ subdirectory).
   */
  private async importMediaFromStandardAnki(uid: string, zip: JSZip, mediaManifest: Map<string, string>): Promise<number> {
    const mediaFiles = this.collectMediaPaths(zip, true);
    return this.importMediaEntries(uid, zip, mediaFiles, mediaManifest);
  }

  /**
   * Legacy import - kept for backward compatibility
   */
  private async importNotetypes(
    uid: string,
    sourceDb: Database.Database
  ): Promise<{ added: number; errors: string[] }> {
    const errors: string[] = [];
    let added = 0;

    try {
      const rows = sourceDb
        .prepare('SELECT * FROM notetypes')
        .all() as EchoeNotetypeRow[];

      if (rows.length === 0) {
        return { added: 0, errors: [] };
      }

      const db = getDatabase();

      for (const row of rows) {
        try {
          // Parse JSON fields
          const tmpls = row.tmpls || '[]';
          const flds = row.flds || '[]';

          // Check if notetype already exists in user scope
          const existing = await db
            .select({ id: echoeNotetypes.id })
            .from(echoeNotetypes)
            .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, row.id)))
            .limit(1);

          if (existing.length === 0) {
            // Insert new notetype
            await db.insert(echoeNotetypes).values({
              id: row.id,
              uid,
              name: row.name,
              mod: row.mod,
              usn: row.usn,
              sortf: row.sortf,
              did: row.did,
              tmpls,
              flds,
              css: row.css || '',
              type: row.type,
              latexPre: row.latexPre || '',
              latexPost: row.latexPost || '',
              req: row.req || '[]',
            });
            added++;
          }
        } catch (error) {
          errors.push(`Failed to import notetype ${row.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      errors.push(`Failed to read notetypes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { added, errors };
  }

  /**
   * Import decks from source database
   */
  private async importDecks(
    uid: string,
    sourceDb: Database.Database
  ): Promise<{ added: number; errors: string[] }> {
    const errors: string[] = [];
    let added = 0;

    try {
      const rows = sourceDb.prepare('SELECT * FROM decks').all() as EchoeDeckRow[];

      if (rows.length === 0) {
        return { added: 0, errors: [] };
      }

      const db = getDatabase();

      for (const row of rows) {
        try {
          // Skip default deck with id=1 if it conflicts with existing
          if (row.id === 1) {
            continue;
          }

          // Check if deck already exists in user scope
          const existing = await db
            .select({ id: echoeDecks.id })
            .from(echoeDecks)
            .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.id, row.id)))
            .limit(1);

          if (existing.length === 0) {
            // Insert new deck
            await db.insert(echoeDecks).values({
              id: row.id,
              uid,
              name: row.name,
              conf: row.conf || 1,
              extendNew: row.extendNew || 20,
              extendRev: row.extendRev || 200,
              usn: row.usn,
              lim: row.lim || 0,
              collapsed: row.collapsed || 0,
              dyn: row.dyn || 0,
              mod: row.mod,
              desc: row.desc || '',
              mid: row.mid || 0,
            });
            added++;
          }
        } catch (error) {
          errors.push(`Failed to import deck ${row.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      errors.push(`Failed to read decks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { added, errors };
  }

  /**
   * Build a map of notetype id → ordered field names by reading from the source database.
   * Anki's notetypes.flds is a JSON array of field definition objects, each with a "name" property.
   */
  private buildNotetypeFieldsMap(sourceDb: Database.Database): Map<number, string[]> {
    try {
      const rows = sourceDb.prepare('SELECT id, flds FROM notetypes').all() as { id: number; flds: unknown }[];
      return this.buildNotetypeFieldsMapFromRows(rows);
    } catch {
      return new Map();
    }
  }

  /**
   * Import notes from source database
   */
  private async importNotes(
    uid: string,
    sourceDb: Database.Database
  ): Promise<{ added: number; updated: number; skipped: number; errors: string[] }> {
    try {
      const rows = sourceDb.prepare('SELECT * FROM notes').all() as EchoeNoteRow[];
      const notetypeFieldsMap = this.buildNotetypeFieldsMap(sourceDb);
      return await this.importNotesRows(uid, rows, notetypeFieldsMap);
    } catch (error) {
      return {
        added: 0,
        updated: 0,
        skipped: 0,
        errors: [`Failed to read notes: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Import cards from source database with FSRS backfill
   * FSRS backfill strategy (per PRD FR-1):
   * 1. If card has revlog, use latest revlog entry for FSRS fields
   * 2. If no revlog and card is new (type=0), keep empty state (let study service initialize)
   * 3. If no revlog but card has scheduling data (type=2), use heuristic mapping
   */
  private async importCards(
    uid: string,
    sourceDb: Database.Database
  ): Promise<{ added: number; updated: number; errors: string[]; fsrsBackfilledFromRevlog: number; fsrsNewCards: number; fsrsHeuristic: number }> {
    return this.importCardsRows(uid, sourceDb, 'Could not read revlog for FSRS backfill in legacy import');
  }

  /**
   * Normalize imported due values into millisecond timestamps.
   * - review cards: Anki day number -> ms
   * - learning/relearning cards: second timestamp -> ms
   */
  private normalizeDueToMilliseconds(due: number, queue: number, type: number): number {
    if (!Number.isFinite(due) || due <= 0) {
      return due;
    }

    if (due >= LEGACY_SECOND_DUE_MAX) {
      return due;
    }

    const effectiveQueue = queue < 0 ? type : queue;

    if (effectiveQueue === 2 && due < LEGACY_DAY_DUE_MAX) {
      return due * DAY_MS;
    }

    if (effectiveQueue === 1 || effectiveQueue === 3) {
      return due * SECOND_MS;
    }

    return due;
  }

  /**
   * Import revlog from source database with FSRS fields (insert ignore duplicates)
   */
  private async importRevlog(uid: string, sourceDb: Database.Database): Promise<number> {
    try {
      const rows = sourceDb.prepare('SELECT * FROM revlog').all() as EchoeRevlogRow[];
      return this.importRevlogRows(uid, rows, { difficultyFallback: FSRS_DIFFICULTY_FALLBACK });
    } catch (error) {
      logger.error('Failed to import revlog:', error);
      return 0;
    }
  }

  /**
   * Import media files from the zip archive
   */
  private async importMedia(uid: string, zip: JSZip): Promise<number> {
    const mediaFiles = this.collectMediaPaths(zip, false);
    return this.importMediaEntries(uid, zip, mediaFiles);
  }

  private buildNotetypeFieldsMapFromRows(rows: Array<{ id: number; flds: unknown }>): Map<number, string[]> {
    const map = new Map<number, string[]>();

    for (const row of rows) {
      try {
        const fieldDefs = this.parseNotetypeFieldDefs(row.flds);
        map.set(row.id, fieldDefs.map((field) => field.name));
      } catch {
        // Skip invalid notetype field definitions
      }
    }

    return map;
  }

  private parseNotetypeFieldDefs(rawFields: unknown): Array<{ name: string }> {
    const parsed = typeof rawFields === 'string' ? JSON.parse(rawFields) : rawFields;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (field): field is { name: string } =>
        typeof field === 'object' && field !== null && typeof (field as { name?: unknown }).name === 'string'
    );
  }

  private async importNotesRows(
    uid: string,
    rows: EchoeNoteRow[],
    notetypeFieldsMap: Map<number, string[]>,
    mediaManifest?: Map<string, string>
  ): Promise<{ added: number; updated: number; skipped: number; errors: string[] }> {
    if (rows.length === 0) {
      return { added: 0, updated: 0, skipped: 0, errors: [] };
    }

    const errors: string[] = [];
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const db = getDatabase();

    for (const row of rows) {
      try {
        const notetypeFields = notetypeFieldsMap.get(row.mid) ?? [];

        const rawValues = row.flds.split('\x1f');
        const fields: Record<string, string> = {};
        for (let i = 0; i < notetypeFields.length; i++) {
          let value = rawValues[i] ?? '';
          if (mediaManifest) {
            value = this.replaceMediaReferences(value, mediaManifest);
          }
          fields[notetypeFields[i]] = value;
        }

        const normalized = normalizeNoteFields({ notetypeFields, fields });

        // Check for existing note in user scope (uid, guid)
        const existing = await db
          .select({ id: echoeNotes.id })
          .from(echoeNotes)
          .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.guid, row.guid)))
          .limit(1);

        if (existing.length > 0) {
          await db
            .update(echoeNotes)
            .set({
              mod: row.mod,
              tags: row.tags || '[]',
              flds: normalized.flds,
              sfld: normalized.sfld,
              csum: normalized.csum,
              fldNames: normalized.fldNames,
              fieldsJson: normalized.fieldsJson,
            })
            .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.guid, row.guid)));
          updated++;
        } else {
          const newNote: NewEchoeNotes = {
            id: row.id,
            uid,
            guid: row.guid,
            mid: row.mid,
            mod: row.mod,
            usn: row.usn,
            tags: row.tags || '[]',
            flds: normalized.flds,
            sfld: normalized.sfld,
            csum: normalized.csum,
            flags: row.flags || 0,
            data: row.data || '{}',
            fldNames: normalized.fldNames,
            fieldsJson: normalized.fieldsJson,
          };
          await db.insert(echoeNotes).values(newNote);
          added++;
        }
      } catch (error) {
        errors.push(`Failed to import note ${row.guid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { added, updated, skipped, errors };
  }

  /**
   * Resolve review timestamp from revlog id.
   *
   * Supported id formats in imported datasets:
   * 1. Unix ms (Anki standard)
   * 2. Unix ms * 1000 (+ random suffix)
   * 3. Unix seconds (legacy edge cases)
   */
  private resolveRevlogReviewTimestamp(revlogId: number): number {
    if (!Number.isFinite(revlogId) || revlogId <= 0) {
      return 0;
    }

    if (revlogId >= REVLOG_ID_MICROSECOND_MIN) {
      return Math.floor(revlogId / SECOND_MS);
    }

    if (revlogId >= REVLOG_ID_MILLISECOND_MIN) {
      return revlogId;
    }

    return revlogId * SECOND_MS;
  }

  private buildLatestRevlogMap(sourceDb: Database.Database, warnMessage: string): Map<number, EchoeRevlogRow> {
    const latestRevlogMap = new Map<number, EchoeRevlogRow>();

    try {
      const revlogRows = sourceDb.prepare('SELECT * FROM revlog ORDER BY id DESC').all() as EchoeRevlogRow[];
      for (const row of revlogRows) {
        if (!latestRevlogMap.has(row.cid)) {
          latestRevlogMap.set(row.cid, row);
        }
      }
    } catch {
      logger.warn(warnMessage);
    }

    return latestRevlogMap;
  }

  private resolveCardFsrsBackfill(
    row: EchoeCardRow,
    latestRevlog: EchoeRevlogRow | undefined,
    now: number
  ): { stability: number; difficulty: number; lastReview: number; source: 'revlog' | 'new' | 'heuristic' } {
    if (latestRevlog) {
      const reviewTimestamp = this.resolveRevlogReviewTimestamp(latestRevlog.id);
      return {
        stability: latestRevlog.ivl > 0 ? latestRevlog.ivl : 1,
        difficulty: this.resolveRevlogDifficulty(latestRevlog.factor, { difficultyFallback: FSRS_DIFFICULTY_FALLBACK }),
        lastReview: reviewTimestamp > 0 ? reviewTimestamp : (row.mod > 0 ? row.mod * SECOND_MS : now),
        source: 'revlog',
      };
    }

    if (row.type === 0 || row.ivl === 0) {
      return {
        stability: 0,
        difficulty: 0,
        lastReview: 0,
        source: 'new',
      };
    }

    return {
      stability: row.ivl > 0 ? row.ivl : 1,
      difficulty: this.resolveRevlogDifficulty(row.factor, { difficultyFallback: FSRS_DIFFICULTY_FALLBACK }),
      lastReview: row.mod > 0 ? row.mod * 1000 : now,
      source: 'heuristic',
    };
  }

  private async importCardsRows(
    uid: string,
    sourceDb: Database.Database,
    revlogWarnMessage: string
  ): Promise<{ added: number; updated: number; errors: string[]; fsrsBackfilledFromRevlog: number; fsrsNewCards: number; fsrsHeuristic: number }> {
    const emptyResult = {
      added: 0,
      updated: 0,
      errors: [] as string[],
      fsrsBackfilledFromRevlog: 0,
      fsrsNewCards: 0,
      fsrsHeuristic: 0,
    };

    try {
      const rows = sourceDb.prepare('SELECT * FROM cards').all() as EchoeCardRow[];
      if (rows.length === 0) {
        return emptyResult;
      }

      const db = getDatabase();
      const latestRevlogMap = this.buildLatestRevlogMap(sourceDb, revlogWarnMessage);
      const now = Date.now();
      const errors: string[] = [];
      let added = 0;
      let updated = 0;
      let fsrsBackfilledFromRevlog = 0;
      let fsrsNewCards = 0;
      let fsrsHeuristic = 0;

      for (const row of rows) {
        try {
          // Check for existing card in user scope
          const existing = await db
            .select({ id: echoeCards.id })
            .from(echoeCards)
            .where(and(eq(echoeCards.uid, uid), eq(echoeCards.id, row.id)))
            .limit(1);

          const fsrs = this.resolveCardFsrsBackfill(row, latestRevlogMap.get(row.id), now);
          if (fsrs.source === 'revlog') {
            fsrsBackfilledFromRevlog++;
          } else if (fsrs.source === 'new') {
            fsrsNewCards++;
          } else {
            fsrsHeuristic++;
          }

          const normalizedDue = this.normalizeDueToMilliseconds(row.due, row.queue, row.type);
          const normalizedOdue = this.normalizeDueToMilliseconds(row.odue, row.type, row.type);

          if (existing.length > 0) {
            await db
              .update(echoeCards)
              .set({
                nid: row.nid,
                did: row.did,
                ord: row.ord,
                mod: row.mod,
                usn: row.usn,
                type: row.type,
                queue: row.queue,
                due: normalizedDue,
                ivl: row.ivl,
                factor: row.factor,
                reps: row.reps,
                lapses: row.lapses,
                left: row.left,
                odue: normalizedOdue,
                odid: row.odid,
                flags: row.flags,
                data: row.data || '{}',
                stability: fsrs.stability,
                difficulty: fsrs.difficulty,
                lastReview: fsrs.lastReview,
              })
              .where(and(eq(echoeCards.uid, uid), eq(echoeCards.id, row.id)));
            updated++;
          } else {
            const newCard: NewEchoeCards = {
              id: row.id,
              uid,
              nid: row.nid,
              did: row.did,
              ord: row.ord,
              mod: row.mod,
              usn: row.usn,
              type: row.type,
              queue: row.queue,
              due: normalizedDue,
              ivl: row.ivl,
              factor: row.factor,
              reps: row.reps,
              lapses: row.lapses,
              left: row.left,
              odue: normalizedOdue,
              odid: row.odid,
              flags: row.flags,
              data: row.data || '{}',
              stability: fsrs.stability,
              difficulty: fsrs.difficulty,
              lastReview: fsrs.lastReview,
            };
            await db.insert(echoeCards).values(newCard);
            added++;
          }
        } catch (error) {
          errors.push(`Failed to import card ${row.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      return {
        added,
        updated,
        errors,
        fsrsBackfilledFromRevlog,
        fsrsNewCards,
        fsrsHeuristic,
      };
    } catch (error) {
      return {
        ...emptyResult,
        errors: [`Failed to read cards: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  private resolveRevlogDifficulty(
    factor: number,
    options: { difficultyFallback: number }
  ): number {
    return factor > 0 ? factor / 1000 : options.difficultyFallback;
  }

  private async importRevlogRows(
    uid: string,
    rows: EchoeRevlogRow[],
    options: { difficultyFallback: number }
  ): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }

    let imported = 0;
    const db = getDatabase();

    for (const row of rows) {
      try {
        // Check for existing revlog in user scope
        const existing = await db
          .select({ id: echoeRevlog.id })
          .from(echoeRevlog)
          .where(and(eq(echoeRevlog.uid, uid), eq(echoeRevlog.id, row.id)))
          .limit(1);

        if (existing.length > 0) {
          continue;
        }

        const difficulty = this.resolveRevlogDifficulty(row.factor, options);
        const stability = row.ivl > 0 ? row.ivl : 1;
        const lastReview = this.resolveRevlogReviewTimestamp(row.id);
        const preStability = row.lastIvl > 0 ? row.lastIvl : 1;
        const preLastReview = lastReview - (row.lastIvl * DAY_MS);

        const newRevlog: NewEchoeRevlog = {
          id: row.id,
          cid: row.cid,
          uid,
          usn: row.usn,
          ease: row.ease,
          ivl: row.ivl,
          lastIvl: row.lastIvl,
          factor: row.factor,
          time: row.time,
          type: row.type,
          stability,
          difficulty,
          lastReview,
          preStability,
          preDifficulty: difficulty,
          preLastReview: preLastReview > 0 ? preLastReview : 0,
          preDue: 0,
          preIvl: row.lastIvl,
          preFactor: row.factor,
          preReps: 0,
          preLapses: 0,
          preLeft: 0,
          preType: row.type,
          preQueue: row.type,
        };

        await db.insert(echoeRevlog).values(newRevlog);
        imported++;
      } catch {
        // Skip duplicates silently
      }
    }

    return imported;
  }

  private collectMediaPaths(zip: JSZip, includeRootFiles: boolean): string[] {
    const excludeFiles = new Set(['collection.anki2', 'collection.anki21', 'col.json', 'media']);

    return Object.keys(zip.files).filter((name) => {
      if (name.endsWith('/')) {
        return false;
      }

      if (name.startsWith('media/')) {
        return true;
      }

      if (!includeRootFiles || excludeFiles.has(name)) {
        return false;
      }

      if (/^\d+$/.test(name)) {
        return true;
      }

      return !name.includes('/');
    });
  }

  private resolveImportMediaFilename(mediaPath: string, mediaManifest?: Map<string, string>): string {
    const normalizedPath = mediaPath.startsWith('media/') ? mediaPath.replace('media/', '') : mediaPath;
    const numericKey = normalizedPath.match(/^\d+$/)?.[0];

    if (numericKey && mediaManifest?.has(numericKey)) {
      return mediaManifest.get(numericKey) || normalizedPath;
    }

    return normalizedPath;
  }

  private async importMediaEntries(
    uid: string,
    zip: JSZip,
    mediaPaths: string[],
    mediaManifest?: Map<string, string>
  ): Promise<number> {
    let imported = 0;

    try {
      for (const mediaPath of mediaPaths) {
        try {
          const file = zip.file(mediaPath);
          if (!file) {
            continue;
          }

          const buffer = await file.async('nodebuffer');
          const filename = this.resolveImportMediaFilename(mediaPath, mediaManifest);
          await this.mediaService.uploadMedia(uid, buffer, filename);
          imported++;
        } catch (error) {
          logger.warn(`Failed to import media ${mediaPath}:`, error);
        }
      }
    } catch (error) {
      logger.error('Failed to import media:', error);
    }

    return imported;
  }
}
