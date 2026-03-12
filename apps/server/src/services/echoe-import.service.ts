/**
 * Echoe Import Service
 * Handles importing .apkg files (both Standard Anki and Echoe Legacy formats)
 */

import Database from 'better-sqlite3';
import JSZip from 'jszip';
import { Service, Inject } from 'typedi';
import { eq, and, inArray, sql } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { echoeNotes, type NewEchoeNotes } from '../db/schema/echoe-notes.js';
import { echoeCards, type NewEchoeCards } from '../db/schema/echoe-cards.js';
import { echoeRevlog, type NewEchoeRevlog } from '../db/schema/echoe-revlog.js';
import { echoeDecks, type NewEchoeDecks } from '../db/schema/echoe-decks.js';
import { echoeNotetypes, type NewEchoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { EchoeMediaService } from './echoe-media.service.js';
import { logger } from '../utils/logger.js';
import { normalizeNoteFields } from '../lib/note-field-normalizer.js';

import type { NewEchoeMedia } from '../db/schema/echoe-media.js';

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
}

type PackageType = 'standard-anki' | 'echoe-legacy' | 'unknown';

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
   */
  private async detectPackageType(zip: JSZip): Promise<PackageType> {
    // Check for col.json (Standard Anki format)
    const colJson = zip.file('col.json');
    if (colJson) {
      return 'standard-anki';
    }

    // Check for collection.anki21/anki2 (Echoe Legacy format)
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
      } catch {
        // If we can't read the DB, assume standard
      }
    }

    // Default to standard Anki if we can't determine
    return 'standard-anki';
  }

  /**
   * Import an .apkg file
   */
  async importApkg(buffer: Buffer): Promise<ImportResultDto> {
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
        return await this.importStandardAnki(zip, result);
      } else {
        return await this.importLegacyEchoe(zip, result);
      }
    } catch (error) {
      logger.error('Import error:', error);
      result.errors.push(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Import Standard Anki APKG format
   */
  private async importStandardAnki(zip: JSZip, result: ImportResultDto): Promise<ImportResultDto> {
    try {
      // Read col.json
      const colJsonFile = zip.file('col.json');
      if (!colJsonFile) {
        result.errors.push('col.json not found in Standard Anki package');
        return result;
      }

      const colJsonContent = await colJsonFile.async('string');
      const col = JSON.parse(colJsonContent);

      // Read media manifest if exists
      const mediaManifest = await this.parseMediaManifest(zip);

      // Find the collection file
      const collectionFile = zip.file('collection.anki21') || zip.file('collection.anki2');
      if (!collectionFile) {
        result.errors.push('No collection file found in .apkg');
        return result;
      }

      const collectionBuffer = await collectionFile.async('nodebuffer');
      const db = new Database(collectionBuffer, { readonly: true });

      try {
        // Import notetypes from col.models
        const notetypeResult = await this.importNotetypesFromColJson(col);
        result.notetypesAdded = notetypeResult.added;
        result.errors.push(...notetypeResult.errors);

        // Import decks from col.decks
        const deckResult = await this.importDecksFromColJson(col);
        result.decksAdded = deckResult.added;
        result.errors.push(...deckResult.errors);

        // Import notes from SQLite
        const noteResult = await this.importNotesFromStandardAnki(db, col, mediaManifest);
        result.notesAdded = noteResult.added;
        result.notesUpdated = noteResult.updated;
        result.notesSkipped = noteResult.skipped;
        result.errors.push(...noteResult.errors);

        // Import cards from SQLite with FSRS backfill
        const cardResult = await this.importCardsFromStandardAnki(db, col);
        result.cardsAdded = cardResult.added;
        result.cardsUpdated = cardResult.updated;
        result.errors.push(...cardResult.errors);

        // Import revlog
        const revlogResult = await this.importRevlogFromStandardAnki(db);
        result.revlogImported = revlogResult;

        // Import media files
        const mediaResult = await this.importMediaFromStandardAnki(zip, mediaManifest);
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
  private async importLegacyEchoe(zip: JSZip, result: ImportResultDto): Promise<ImportResultDto> {
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
      const notetypeResult = await this.importNotetypes(db);
      result.notetypesAdded = notetypeResult.added;
      result.errors.push(...notetypeResult.errors);

      // Import decks
      const deckResult = await this.importDecks(db);
      result.decksAdded = deckResult.added;
      result.errors.push(...deckResult.errors);

      // Import notes
      const noteResult = await this.importNotes(db);
      result.notesAdded = noteResult.added;
      result.notesUpdated = noteResult.updated;
      result.notesSkipped = noteResult.skipped;
      result.errors.push(...noteResult.errors);

      // Import cards
      const cardResult = await this.importCards(db);
      result.cardsAdded = cardResult.added;
      result.cardsUpdated = cardResult.updated;
      result.errors.push(...cardResult.errors);

      // Import revlog
      const revlogResult = await this.importRevlog(db);
      result.revlogImported = revlogResult;

      // Import media files
      const mediaResult = await this.importMedia(zip, db);
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
  private async importNotetypesFromColJson(col: Record<string, unknown>): Promise<{ added: number; errors: string[] }> {
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

          // Check if notetype already exists
          const existing = await db
            .select({ id: echoeNotetypes.id })
            .from(echoeNotetypes)
            .where(eq(echoeNotetypes.id, modelId))
            .limit(1);

          if (existing.length === 0) {
            // Insert new notetype
            await db.insert(echoeNotetypes).values({
              id: modelId,
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
  private async importDecksFromColJson(col: Record<string, unknown>): Promise<{ added: number; errors: string[] }> {
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

          // Check if deck already exists
          const existing = await db
            .select({ id: echoeDecks.id })
            .from(echoeDecks)
            .where(eq(echoeDecks.id, deckId))
            .limit(1);

          if (existing.length === 0) {
            // Insert new deck
            await db.insert(echoeDecks).values({
              id: deckId,
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
    sourceDb: Database.Database,
    col: Record<string, unknown>,
    mediaManifest: Map<string, string>
  ): Promise<{ added: number; updated: number; skipped: number; errors: string[] }> {
    const errors: string[] = [];
    let added = 0;
    let updated = 0;
    let skipped = 0;

    try {
      const rows = sourceDb.prepare('SELECT * FROM notes').all() as EchoeNoteRow[];

      if (rows.length === 0) {
        return { added: 0, updated: 0, skipped: 0, errors: [] };
      }

      // Build notetype field names map from col.json
      const notetypeFieldsMap = this.buildNotetypeFieldsMapFromColJson(col);

      const db = getDatabase();

      for (const row of rows) {
        try {
          // Resolve notetype field names for this note
          const notetypeFields = notetypeFieldsMap.get(row.mid) ?? [];

          // Parse flds (\x1f-separated) into a field name → value map
          const rawValues = row.flds.split('\x1f');
          const fields: Record<string, string> = {};
          for (let i = 0; i < notetypeFields.length; i++) {
            // Replace media references with actual filenames
            let value = rawValues[i] ?? '';
            value = this.replaceMediaReferences(value, mediaManifest);
            fields[notetypeFields[i]] = value;
          }

          // Normalize using the standard module
          const normalized = normalizeNoteFields({ notetypeFields, fields });

          // Check if note with same guid already exists
          const existing = await db
            .select({ id: echoeNotes.id })
            .from(echoeNotes)
            .where(eq(echoeNotes.guid, row.guid))
            .limit(1);

          if (existing.length > 0) {
            // Update existing note
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
              .where(eq(echoeNotes.guid, row.guid));
            updated++;
          } else {
            // Insert new note
            const newNote: NewEchoeNotes = {
              id: row.id,
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
    } catch (error) {
      errors.push(`Failed to read notes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { added, updated, skipped, errors };
  }

  /**
   * Build notetype fields map from col.json models
   */
  private buildNotetypeFieldsMapFromColJson(col: Record<string, unknown>): Map<number, string[]> {
    const map = new Map<number, string[]>();

    try {
      const models = col.models as Record<string, { id: number; flds: string }>;
      if (!models || typeof models !== 'object') {
        return map;
      }

      for (const [mid, model] of Object.entries(models)) {
        try {
          const modelId = parseInt(mid, 10);
          const fieldDefs = JSON.parse(model.flds) as { name: string }[];
          map.set(modelId, fieldDefs.map(f => f.name));
        } catch {
          // Skip invalid JSON
        }
      }
    } catch {
      // Return empty map
    }

    return map;
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
   */
  private async importCardsFromStandardAnki(
    sourceDb: Database.Database,
    col: Record<string, unknown>
  ): Promise<{ added: number; updated: number; errors: string[] }> {
    const errors: string[] = [];
    let added = 0;
    let updated = 0;

    try {
      const rows = sourceDb.prepare('SELECT * FROM cards').all() as EchoeCardRow[];

      if (rows.length === 0) {
        return { added: 0, updated: 0, errors: [] };
      }

      const db = getDatabase();

      // Get current time for FSRS backfill
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;

      for (const row of rows) {
        try {
          // Check if card already exists
          const existing = await db
            .select({ id: echoeCards.id })
            .from(echoeCards)
            .where(eq(echoeCards.id, row.id))
            .limit(1);

          // Calculate FSRS fields from card data
          // For Standard Anki, we backfill: stability = ivl (if > 0), difficulty = factor/1000
          const stability = row.ivl > 0 ? row.ivl : 1;
          const difficulty = row.factor > 0 ? row.factor / 1000 : 2.5;
          // Use card mod time as last_review if available, otherwise use current time
          const lastReview = row.mod > 0 ? row.mod * 1000 : now;

          if (existing.length > 0) {
            // Update existing card with FSRS fields
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
                due: row.due,
                ivl: row.ivl,
                factor: row.factor,
                reps: row.reps,
                lapses: row.lapses,
                left: row.left,
                odue: row.odue,
                odid: row.odid,
                flags: row.flags,
                data: row.data || '{}',
                // FSRS fields
                stability: stability,
                difficulty: difficulty,
                lastReview: lastReview,
              })
              .where(eq(echoeCards.id, row.id));
            updated++;
          } else {
            // Insert new card with FSRS fields
            const newCard: NewEchoeCards = {
              id: row.id,
              nid: row.nid,
              did: row.did,
              ord: row.ord,
              mod: row.mod,
              usn: row.usn,
              type: row.type,
              queue: row.queue,
              due: row.due,
              ivl: row.ivl,
              factor: row.factor,
              reps: row.reps,
              lapses: row.lapses,
              left: row.left,
              odue: row.odue,
              odid: row.odid,
              flags: row.flags,
              data: row.data || '{}',
              // FSRS fields
              stability: stability,
              difficulty: difficulty,
              lastReview: lastReview,
            };
            await db.insert(echoeCards).values(newCard);
            added++;
          }
        } catch (error) {
          errors.push(`Failed to import card ${row.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      errors.push(`Failed to read cards: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { added, updated, errors };
  }

  /**
   * Import revlog from Standard Anki SQLite database
   */
  private async importRevlogFromStandardAnki(sourceDb: Database.Database): Promise<number> {
    let imported = 0;

    try {
      const rows = sourceDb.prepare('SELECT * FROM revlog').all() as EchoeRevlogRow[];

      if (rows.length === 0) {
        return 0;
      }

      const db = getDatabase();

      for (const row of rows) {
        try {
          // Check if revlog entry already exists
          const existing = await db
            .select({ id: echoeRevlog.id })
            .from(echoeRevlog)
            .where(eq(echoeRevlog.id, row.id))
            .limit(1);

          if (existing.length === 0) {
            // Calculate FSRS fields from current card state
            const stability = row.ivl > 0 ? row.ivl : 1;
            const difficulty = row.factor > 0 ? row.factor / 1000 : 2.5;
            const lastReview = row.time;

            // Calculate pre-review values based on lastIvl
            const preStability = row.lastIvl > 0 ? row.lastIvl : 1;
            const preLastReview = row.time - (row.lastIvl * 24 * 60 * 60 * 1000); // Approximate

            // Insert new revlog entry with FSRS fields (backfilled from card state)
            const newRevlog: NewEchoeRevlog = {
              id: row.id,
              cid: row.cid,
              usn: row.usn,
              ease: row.ease,
              ivl: row.ivl,
              lastIvl: row.lastIvl,
              factor: row.factor,
              time: row.time,
              type: row.type,
              // FSRS fields - current state after review
              stability: stability,
              difficulty: difficulty,
              lastReview: lastReview,
              // Pre-review snapshot (estimated from lastIvl)
              preStability: preStability,
              preDifficulty: difficulty, // Assume same difficulty before review
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
          }
        } catch {
          // Skip duplicates silently
        }
      }
    } catch (error) {
      logger.error('Failed to import revlog:', error);
    }

    return imported;
  }

  /**
   * Import media files from Standard Anki package
   */
  private async importMediaFromStandardAnki(zip: JSZip, mediaManifest: Map<string, string>): Promise<number> {
    let imported = 0;

    try {
      // Find all media files in the zip
      const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith('media/'));

      for (const mediaPath of mediaFiles) {
        try {
          const file = zip.file(mediaPath);
          if (!file) continue;

          const buffer = await file.async('nodebuffer');
          // Get filename from path
          let filename = mediaPath.replace('media/', '');

          // Check if it's a numeric reference that needs mapping
          const actualName = mediaManifest.get(filename);
          if (actualName) {
            filename = actualName;
          }

          // Upload to storage via EchoeMediaService
          await this.mediaService.uploadMedia(buffer, filename);
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

  /**
   * Legacy import - kept for backward compatibility
   */
  private async importNotetypes(
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

          // Check if notetype already exists
          const existing = await db
            .select({ id: echoeNotetypes.id })
            .from(echoeNotetypes)
            .where(eq(echoeNotetypes.id, row.id))
            .limit(1);

          if (existing.length === 0) {
            // Insert new notetype
            await db.insert(echoeNotetypes).values({
              id: row.id,
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

          // Check if deck already exists
          const existing = await db
            .select({ id: echoeDecks.id })
            .from(echoeDecks)
            .where(eq(echoeDecks.id, row.id))
            .limit(1);

          if (existing.length === 0) {
            // Insert new deck
            await db.insert(echoeDecks).values({
              id: row.id,
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
    const map = new Map<number, string[]>();
    try {
      const rows = sourceDb.prepare('SELECT id, flds FROM notetypes').all() as { id: number; flds: string }[];
      for (const row of rows) {
        try {
          const fieldDefs = JSON.parse(row.flds) as { name: string }[];
          map.set(row.id, fieldDefs.map((f) => f.name));
        } catch {
          // If parsing fails, leave this notetype out of the map
        }
      }
    } catch {
      // If notetypes table is missing, return empty map
    }
    return map;
  }

  /**
   * Import notes from source database
   */
  private async importNotes(
    sourceDb: Database.Database
  ): Promise<{ added: number; updated: number; skipped: number; errors: string[] }> {
    const errors: string[] = [];
    let added = 0;
    let updated = 0;
    let skipped = 0;

    try {
      const rows = sourceDb.prepare('SELECT * FROM notes').all() as EchoeNoteRow[];

      if (rows.length === 0) {
        return { added: 0, updated: 0, skipped: 0, errors: [] };
      }

      // Build notetype field names map once for all notes
      const notetypeFieldsMap = this.buildNotetypeFieldsMap(sourceDb);

      const db = getDatabase();

      for (const row of rows) {
        try {
          // Resolve notetype field names for this note
          const notetypeFields = notetypeFieldsMap.get(row.mid) ?? [];

          // Parse flds (\x1f-separated) into a field name → value map
          const rawValues = row.flds.split('\x1f');
          const fields: Record<string, string> = {};
          for (let i = 0; i < notetypeFields.length; i++) {
            fields[notetypeFields[i]] = rawValues[i] ?? '';
          }

          // Normalize using the standard module
          const normalized = normalizeNoteFields({ notetypeFields, fields });

          // Check if note with same guid already exists
          const existing = await db
            .select({ id: echoeNotes.id })
            .from(echoeNotes)
            .where(eq(echoeNotes.guid, row.guid))
            .limit(1);

          if (existing.length > 0) {
            // Update existing note with normalized field data
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
              .where(eq(echoeNotes.guid, row.guid));
            updated++;
          } else {
            // Insert new note with normalized field data
            const newNote: NewEchoeNotes = {
              id: row.id,
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
    } catch (error) {
      errors.push(`Failed to read notes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { added, updated, skipped, errors };
  }

  /**
   * Import cards from source database
   */
  private async importCards(
    sourceDb: Database.Database
  ): Promise<{ added: number; updated: number; errors: string[] }> {
    const errors: string[] = [];
    let added = 0;
    let updated = 0;

    try {
      const rows = sourceDb.prepare('SELECT * FROM cards').all() as EchoeCardRow[];

      if (rows.length === 0) {
        return { added: 0, updated: 0, errors: [] };
      }

      const db = getDatabase();

      for (const row of rows) {
        try {
          // Check if card already exists
          const existing = await db
            .select({ id: echoeCards.id })
            .from(echoeCards)
            .where(eq(echoeCards.id, row.id))
            .limit(1);

          if (existing.length > 0) {
            // Update existing card
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
                due: row.due,
                ivl: row.ivl,
                factor: row.factor,
                reps: row.reps,
                lapses: row.lapses,
                left: row.left,
                odue: row.odue,
                odid: row.odid,
                flags: row.flags,
                data: row.data || '{}',
              })
              .where(eq(echoeCards.id, row.id));
            updated++;
          } else {
            // Insert new card
            const newCard: NewEchoeCards = {
              id: row.id,
              nid: row.nid,
              did: row.did,
              ord: row.ord,
              mod: row.mod,
              usn: row.usn,
              type: row.type,
              queue: row.queue,
              due: row.due,
              ivl: row.ivl,
              factor: row.factor,
              reps: row.reps,
              lapses: row.lapses,
              left: row.left,
              odue: row.odue,
              odid: row.odid,
              flags: row.flags,
              data: row.data || '{}',
            };
            await db.insert(echoeCards).values(newCard);
            added++;
          }
        } catch (error) {
          errors.push(`Failed to import card ${row.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      errors.push(`Failed to read cards: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { added, updated, errors };
  }

  /**
   * Import revlog from source database (insert ignore duplicates)
   */
  private async importRevlog(sourceDb: Database.Database): Promise<number> {
    let imported = 0;

    try {
      const rows = sourceDb.prepare('SELECT * FROM revlog').all() as EchoeRevlogRow[];

      if (rows.length === 0) {
        return 0;
      }

      const db = getDatabase();

      for (const row of rows) {
        try {
          // Check if revlog entry already exists
          const existing = await db
            .select({ id: echoeRevlog.id })
            .from(echoeRevlog)
            .where(eq(echoeRevlog.id, row.id))
            .limit(1);

          if (existing.length === 0) {
            // Insert new revlog entry
            const newRevlog: NewEchoeRevlog = {
              id: row.id,
              cid: row.cid,
              usn: row.usn,
              ease: row.ease,
              ivl: row.ivl,
              lastIvl: row.lastIvl,
              factor: row.factor,
              time: row.time,
              type: row.type,
            };
            await db.insert(echoeRevlog).values(newRevlog);
            imported++;
          }
        } catch {
          // Skip duplicates silently
        }
      }
    } catch (error) {
      logger.error('Failed to import revlog:', error);
    }

    return imported;
  }

  /**
   * Import media files from the zip archive
   */
  private async importMedia(zip: JSZip, sourceDb: Database.Database): Promise<number> {
    let imported = 0;

    try {
      // Find all media files in the zip
      const mediaFiles = Object.keys(zip.files).filter((name) => name.startsWith('media/'));

      for (const mediaPath of mediaFiles) {
        try {
          const file = zip.file(mediaPath);
          if (!file) continue;

          const buffer = await file.async('nodebuffer');
          const filename = mediaPath.replace('media/', '');

          // Upload to storage via EchoeMediaService
          await this.mediaService.uploadMedia(buffer, filename);
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
