/**
 * Echoe Import Service
 * Handles importing .apkg files (both Standard Anki and Echoe Legacy formats)
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';
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
import { parseHtmlToJson } from '../lib/prosemirror-serializer.js';
import { generateTypeId } from '../utils/id.js';
import { OBJECT_TYPE } from '../models/constant/type.js';
import type { ImportResultDto, ImportErrorDetailDto } from '@echoe/dto';
import type { RichTextFields } from '../types/note-fields.js';

type PackageType = 'standard-anki' | 'echoe-legacy' | 'unknown';

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

interface ImportReferenceMap {
  midToNoteTypeId: Map<string, string>;
  didToDeckId: Map<string, string>;
  nidToNoteId: Map<string, string>;
  cidToCardId: Map<string, string>;
}

@Service()
export class EchoeImportService {
  constructor(@Inject(() => EchoeMediaService) private mediaService: EchoeMediaService) {}

  private createImportReferenceMap(): ImportReferenceMap {
    return {
      midToNoteTypeId: new Map(),
      didToDeckId: new Map(),
      nidToNoteId: new Map(),
      cidToCardId: new Map(),
    };
  }

  private getSourceIdKey(id: number | string): string {
    return String(id);
  }

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
   * Validate .apkg file format
   */
  private async validateApkgFormat(buffer: Buffer): Promise<{ valid: boolean; error?: string }> {
    try {
      // Try to load as ZIP
      const zip = await JSZip.loadAsync(buffer);

      // Check for required collection file
      const hasCollection = zip.file('collection.anki21') || zip.file('collection.anki2');
      if (!hasCollection) {
        return {
          valid: false,
          error: 'Invalid .apkg format: Missing collection database file. Please ensure this is a valid Anki deck export.',
        };
      }

      return { valid: true };
    } catch (error) {
      logger.error('APKG validation error:', error);
      if (error instanceof Error && error.message.includes('invalid zip')) {
        return {
          valid: false,
          error: 'Invalid file format: The file is not a valid ZIP archive. Please export your deck from Anki again.',
        };
      }
      return {
        valid: false,
        error: 'Invalid .apkg file: Unable to read file contents. The file may be corrupted.',
      };
    }
  }

  /**
   * Import an .apkg file
   * @param uid User ID
   * @param buffer APKG file buffer
   * @param targetDeckId Optional deck ID to import all cards into (instead of creating decks from .apkg)
   * @param deckName Optional deck name to use when creating new decks (instead of using APKG deck names)
   */
  async importApkg(uid: string, buffer: Buffer, targetDeckId?: string, deckName?: string): Promise<ImportResultDto> {
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
      errorDetails: [],
    };

    try {
      // Validate .apkg format before processing
      const validation = await this.validateApkgFormat(buffer);
      if (!validation.valid) {
        result.errors.push(validation.error || 'Invalid .apkg file');
        result.errorDetails?.push({
          category: 'general',
          message: validation.error || 'Invalid .apkg file',
        });
        return result;
      }

      // Unzip the .apkg file
      const zip = await JSZip.loadAsync(buffer);

      // Detect package type
      const packageType = await this.detectPackageType(zip);
      logger.info(`Detected package type: ${packageType}`);

      if (packageType === 'standard-anki') {
        return await this.importStandardAnki(uid, zip, result, targetDeckId, deckName);
      } else {
        return await this.importLegacyEchoe(uid, zip, result, targetDeckId, deckName);
      }
    } catch (error) {
      logger.error('Import error:', error);
      const errorMessage = this.getReadableErrorMessage(error);
      result.errors.push(errorMessage);
      result.errorDetails?.push({
        category: 'general',
        message: errorMessage,
      });
    }

    return result;
  }

  /**
   * Convert technical errors to user-friendly messages
   */
  private getReadableErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Import failed: Unknown error occurred';
    }

    const message = error.message.toLowerCase();

    // SQLite errors
    if (message.includes('sqlite') || message.includes('database')) {
      return 'Database error: The collection database is corrupted or incompatible. Try exporting your deck from Anki again.';
    }

    // ZIP/extraction errors
    if (message.includes('zip') || message.includes('inflate') || message.includes('decompress')) {
      return 'File extraction error: The .apkg file is corrupted. Please re-export your deck from Anki.';
    }

    // Media errors
    if (message.includes('media')) {
      return 'Media import error: Some media files could not be imported. Your notes have been imported, but media may be missing.';
    }

    // Memory/size errors
    if (message.includes('memory') || message.includes('heap')) {
      return 'File too large: The .apkg file is too large to process. Try splitting your deck into smaller parts.';
    }

    // Generic fallback
    return `Import failed: ${error.message}`;
  }

  /**
   * Import Standard Anki APKG format
   * Supports both official format (collection.anki2/anki21) and legacy col.json.
   */
  private async importStandardAnki(uid: string, zip: JSZip, result: ImportResultDto, targetDeckId?: string, deckName?: string): Promise<ImportResultDto> {
    let db: DatabaseType | null = null;

    try {
      // Find the collection file (required for Standard Anki)
      const collectionFile = zip.file('collection.anki21') || zip.file('collection.anki2');
      if (!collectionFile) {
        const error = 'No collection file found in .apkg';
        result.errors.push(error);
        result.errorDetails?.push({ category: 'general', message: error });
        return result;
      }

      const collectionBuffer = await collectionFile.async('nodebuffer');

      // Try to open SQLite database with error handling
      try {
        db = new Database(collectionBuffer, { readonly: true });

        // Validate database integrity
        const integrityCheck = db.pragma('integrity_check', { simple: true });
        if (integrityCheck !== 'ok') {
          throw new Error('Database integrity check failed');
        }
      } catch (dbError) {
        logger.error('SQLite database error:', dbError);
        const error = 'Corrupted database: The collection database is damaged or incompatible. Please export your deck from Anki again.';
        result.errors.push(error);
        result.errorDetails?.push({ category: 'general', message: error });
        return result;
      }

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

      const referenceMap = this.createImportReferenceMap();

      try {
        // Import notetypes from col.models
        const notetypeResult = await this.importNotetypesFromColJson(uid, col, referenceMap);
        result.notetypesAdded = notetypeResult.added;
        result.errors.push(...notetypeResult.errors);

        // Import decks from col.decks OR use targetDeckId OR use deckName
        if (targetDeckId) {
          // When targetDeckId is provided, map all source deck IDs to the target deck
          await this.mapAllDecksToTarget(uid, col, targetDeckId, referenceMap);
          result.decksAdded = 0; // No new decks created
        } else if (deckName) {
          // When deckName is provided, create a single deck with that name
          const deckResult = await this.importSingleDeck(uid, col, deckName, referenceMap);
          result.decksAdded = deckResult.added;
          result.errors.push(...deckResult.errors);
        } else {
          const deckResult = await this.importDecksFromColJson(uid, col, referenceMap);
          result.decksAdded = deckResult.added;
          result.errors.push(...deckResult.errors);
        }

        // Import media files FIRST to get filename mapping
        const mediaResult = await this.importMediaFromStandardAnki(uid, zip, mediaManifest);
        result.mediaImported = mediaResult.count;
        const mediaFilenameMap = mediaResult.filenameMap;
        // Add media errors but don't fail the whole import
        if (mediaResult.errors.length > 0) {
          result.errors.push(...mediaResult.errors);
          result.errorDetails?.push({
            category: 'media',
            message: `${mediaResult.errors.length} media files could not be imported. Notes have been imported successfully.`,
          });
        }

        // Import notes from SQLite (with media filename mapping)
        const noteResult = await this.importNotesFromStandardAnki(uid, db, col, mediaManifest, mediaFilenameMap, referenceMap);
        result.notesAdded = noteResult.added;
        result.notesUpdated = noteResult.updated;
        result.notesSkipped = noteResult.skipped;
        result.errors.push(...noteResult.errors);

        // Import cards from SQLite with FSRS backfill
        const cardResult = await this.importCardsFromStandardAnki(uid, db, col, referenceMap);
        result.cardsAdded = cardResult.added;
        result.cardsUpdated = cardResult.updated;
        result.errors.push(...cardResult.errors);
        // FSRS backfill stats
        result.fsrsBackfilledFromRevlog = cardResult.fsrsBackfilledFromRevlog;
        result.fsrsNewCards = cardResult.fsrsNewCards;
        result.fsrsHeuristic = cardResult.fsrsHeuristic;

        // Import revlog
        const revlogResult = await this.importRevlogFromStandardAnki(uid, db, referenceMap);
        result.revlogImported = revlogResult;
      } finally {
        if (db) {
          db.close();
        }
      }
    } catch (error) {
      logger.error('Standard Anki import error:', error);
      const errorMessage = this.getReadableErrorMessage(error);
      result.errors.push(errorMessage);
      result.errorDetails?.push({ category: 'general', message: errorMessage });
    }

    return result;
  }

  /**
   * Import Echoe Legacy format
   */
  private async importLegacyEchoe(uid: string, zip: JSZip, result: ImportResultDto, targetDeckId?: string, deckName?: string): Promise<ImportResultDto> {
    let db: DatabaseType | null = null;

    try {
      // Find the collection file (collection.anki21 or collection.anki2)
      let collectionFile = zip.file('collection.anki21');
      if (!collectionFile) {
        collectionFile = zip.file('collection.anki2');
      }
      if (!collectionFile) {
        const error = 'No collection file found in .apkg';
        result.errors.push(error);
        result.errorDetails?.push({ category: 'general', message: error });
        return result;
      }

      // Get the collection as a buffer
      const collectionBuffer = await collectionFile.async('nodebuffer');

      // Try to open SQLite database with error handling
      try {
        db = new Database(collectionBuffer, { readonly: true });

        // Validate database integrity
        const integrityCheck = db.pragma('integrity_check', { simple: true });
        if (integrityCheck !== 'ok') {
          throw new Error('Database integrity check failed');
        }
      } catch (dbError) {
        logger.error('SQLite database error:', dbError);
        const error = 'Corrupted database: The collection database is damaged or incompatible. Please export your deck from Anki again.';
        result.errors.push(error);
        result.errorDetails?.push({ category: 'general', message: error });
        return result;
      }

      const referenceMap = this.createImportReferenceMap();

      // Import notetypes first
      const notetypeResult = await this.importNotetypes(uid, db, referenceMap);
      result.notetypesAdded = notetypeResult.added;
      result.errors.push(...notetypeResult.errors);

      // Import decks OR use targetDeckId OR use deckName
      if (targetDeckId) {
        // When targetDeckId is provided, map all source deck IDs to the target deck
        await this.mapAllDecksToTargetFromDb(uid, db, targetDeckId, referenceMap);
        result.decksAdded = 0; // No new decks created
      } else if (deckName) {
        // When deckName is provided, create a single deck with that name
        const deckResult = await this.importSingleDeckFromDb(uid, db, deckName, referenceMap);
        result.decksAdded = deckResult.added;
        result.errors.push(...deckResult.errors);
      } else {
        const deckResult = await this.importDecks(uid, db, referenceMap);
        result.decksAdded = deckResult.added;
        result.errors.push(...deckResult.errors);
      }

      // Import notes
      const noteResult = await this.importNotes(uid, db, referenceMap);
      result.notesAdded = noteResult.added;
      result.notesUpdated = noteResult.updated;
      result.notesSkipped = noteResult.skipped;
      result.errors.push(...noteResult.errors);

      // Import cards
      const cardResult = await this.importCards(uid, db, referenceMap);
      result.cardsAdded = cardResult.added;
      result.cardsUpdated = cardResult.updated;
      result.errors.push(...cardResult.errors);
      // FSRS backfill stats
      result.fsrsBackfilledFromRevlog = cardResult.fsrsBackfilledFromRevlog;
      result.fsrsNewCards = cardResult.fsrsNewCards;
      result.fsrsHeuristic = cardResult.fsrsHeuristic;

      // Import revlog
      const revlogResult = await this.importRevlog(uid, db, referenceMap);
      result.revlogImported = revlogResult;

      // Import media files
      const mediaResult = await this.importMedia(uid, zip);
      result.mediaImported = mediaResult.count;
      // Add media errors but don't fail the whole import
      if (mediaResult.errors.length > 0) {
        result.errors.push(...mediaResult.errors);
        result.errorDetails?.push({
          category: 'media',
          message: `${mediaResult.errors.length} media files could not be imported. Notes have been imported successfully.`,
        });
      }
    } catch (error) {
      logger.error('Legacy Echoe import error:', error);
      const errorMessage = this.getReadableErrorMessage(error);
      result.errors.push(errorMessage);
      result.errorDetails?.push({ category: 'general', message: errorMessage });
    } finally {
      if (db) {
        db.close();
      }
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
  private async importNotetypesFromColJson(
    uid: string,
    col: Record<string, unknown>,
    referenceMap: ImportReferenceMap
  ): Promise<{ added: number; errors: string[] }> {
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
          const sourceMid = this.getSourceIdKey(mid);
          const modelMid = Number.isFinite(model?.id) ? this.getSourceIdKey(model.id) : sourceMid;

          // Check if notetype already exists in user scope by name
          const existing = await db
            .select({ noteTypeId: echoeNotetypes.noteTypeId })
            .from(echoeNotetypes)
            .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.name, model.name), eq(echoeNotetypes.deletedAt, 0)))
            .limit(1);

          let noteTypeId = existing[0]?.noteTypeId;

          if (!noteTypeId) {
            // Generate new business ID for imported notetype
            noteTypeId = generateTypeId(OBJECT_TYPE.ECHOE_NOTETYPE);

            // Insert new notetype with generated business ID
            await db.insert(echoeNotetypes).values({
              noteTypeId,
              uid,
              name: model.name,
              mod: model.mod || 0,
              usn: model.usn || 0,
              sortf: model.sortf || 0,
              did: '',
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

          referenceMap.midToNoteTypeId.set(sourceMid, noteTypeId);
          referenceMap.midToNoteTypeId.set(modelMid, noteTypeId);
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
  private async importDecksFromColJson(
    uid: string,
    col: Record<string, unknown>,
    referenceMap: ImportReferenceMap
  ): Promise<{ added: number; errors: string[] }> {
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
          const sourceDid = this.getSourceIdKey(did);
          const deckDid = Number.isFinite(deck?.id) ? this.getSourceIdKey(deck.id) : sourceDid;

          // Check if deck already exists in user scope by name
          const existing = await db
            .select({ deckId: echoeDecks.deckId })
            .from(echoeDecks)
            .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.name, deck.name), eq(echoeDecks.deletedAt, 0)))
            .limit(1);

          let deckId = existing[0]?.deckId;

          if (!deckId) {
            // Generate new business ID for imported deck
            deckId = generateTypeId(OBJECT_TYPE.ECHOE_DECK);

            // Insert new deck with generated business ID
            await db.insert(echoeDecks).values({
              deckId,
              uid,
              name: deck.name,
              conf: '',
              extendNew: 20,
              extendRev: 200,
              usn: deck.usn || 0,
              lim: 0,
              collapsed: deck.collapsed ? 1 : 0,
              dyn: deck.dyn || 0,
              mod: deck.mod || 0,
              desc: deck.desc || '',
              mid: null,
            });
            added++;
          }

          referenceMap.didToDeckId.set(sourceDid, deckId);
          referenceMap.didToDeckId.set(deckDid, deckId);
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
   * Import a single deck with a custom name (for deckName option)
   */
  private async importSingleDeck(
    uid: string,
    col: Record<string, unknown>,
    deckName: string,
    referenceMap: ImportReferenceMap
  ): Promise<{ added: number; errors: string[] }> {
    const errors: string[] = [];
    let added = 0;

    try {
      const db = getDatabase();

      // Check if deck already exists in user scope by name
      const existing = await db
        .select({ deckId: echoeDecks.deckId })
        .from(echoeDecks)
        .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.name, deckName), eq(echoeDecks.deletedAt, 0)))
        .limit(1);

      let deckId = existing[0]?.deckId;

      if (!deckId) {
        // Generate new business ID for imported deck
        deckId = generateTypeId(OBJECT_TYPE.ECHOE_DECK);

        // Insert new deck with generated business ID
        await db.insert(echoeDecks).values({
          deckId,
          uid,
          name: deckName,
          conf: '',
          extendNew: 20,
          extendRev: 200,
          usn: 0,
          lim: 0,
          collapsed: 0,
          dyn: 0,
          mod: Math.floor(Date.now() / 1000),
          desc: '',
          mid: null,
        });
        added++;
      }

      // Get all deck IDs from the APKG and map them to our new deck
      const decks = col.decks as Record<string, { id: number }>;
      if (decks && typeof decks === 'object') {
        for (const [did, deck] of Object.entries(decks)) {
          const sourceDid = this.getSourceIdKey(did);
          const deckDid = Number.isFinite(deck?.id) ? this.getSourceIdKey(deck.id) : sourceDid;
          referenceMap.didToDeckId.set(sourceDid, deckId);
          referenceMap.didToDeckId.set(deckDid, deckId);
        }
      }
    } catch (error) {
      errors.push(`Failed to import deck ${deckName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { added, errors };
  }

  /**
   * Map all source deck IDs to a target deck (from col.json format)
   */
  private async mapAllDecksToTarget(
    uid: string,
    col: Record<string, unknown>,
    targetDeckId: string,
    referenceMap: ImportReferenceMap
  ): Promise<void> {
    try {
      const decks = col.decks as Record<string, { id: number }>;

      if (!decks || typeof decks !== 'object') {
        return;
      }

      // Verify target deck exists and belongs to user
      const db = getDatabase();
      const targetDeck = await db
        .select({ deckId: echoeDecks.deckId })
        .from(echoeDecks)
        .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, targetDeckId), eq(echoeDecks.deletedAt, 0)))
        .limit(1);

      if (targetDeck.length === 0) {
        throw new Error(`Target deck ${targetDeckId} not found or does not belong to user`);
      }

      // Map all source deck IDs to the target deck
      for (const [did, deck] of Object.entries(decks)) {
        const sourceDid = this.getSourceIdKey(did);
        const deckDid = Number.isFinite(deck?.id) ? this.getSourceIdKey(deck.id) : sourceDid;

        referenceMap.didToDeckId.set(sourceDid, targetDeckId);
        referenceMap.didToDeckId.set(deckDid, targetDeckId);
      }
    } catch (error) {
      logger.error('Failed to map decks to target:', error);
      throw error;
    }
  }

  /**
   * Map all source deck IDs to a target deck (from SQLite database)
   */
  private async mapAllDecksToTargetFromDb(
    uid: string,
    sourceDb: DatabaseType,
    targetDeckId: string,
    referenceMap: ImportReferenceMap
  ): Promise<void> {
    try {
      // Verify target deck exists and belongs to user
      const db = getDatabase();
      const targetDeck = await db
        .select({ deckId: echoeDecks.deckId })
        .from(echoeDecks)
        .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, targetDeckId), eq(echoeDecks.deletedAt, 0)))
        .limit(1);

      if (targetDeck.length === 0) {
        throw new Error(`Target deck ${targetDeckId} not found or does not belong to user`);
      }

      // Get all source deck IDs from the database
      const rows = sourceDb.prepare('SELECT id FROM decks').all() as { id: string }[];

      // Map all source deck IDs to the target deck
      for (const row of rows) {
        const sourceDid = this.getSourceIdKey(row.id);
        referenceMap.didToDeckId.set(sourceDid, targetDeckId);
      }
    } catch (error) {
      logger.error('Failed to map decks to target from db:', error);
      throw error;
    }
  }

  /**
   * Import notes from Standard Anki SQLite database
   */
  private async importNotesFromStandardAnki(
    uid: string,
    sourceDb: DatabaseType,
    col: Record<string, unknown>,
    mediaManifest: Map<string, string>,
    mediaFilenameMap: Map<string, string>,
    referenceMap: ImportReferenceMap
  ): Promise<{ added: number; updated: number; skipped: number; errors: string[] }> {
    try {
      const rows = sourceDb.prepare('SELECT * FROM notes').all() as EchoeNoteRow[];
      const notetypeFieldsMap = this.buildNotetypeFieldsMapFromColJson(col);
      return await this.importNotesRows(uid, rows, notetypeFieldsMap, mediaManifest, mediaFilenameMap, referenceMap);
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
  private buildNotetypeFieldsMapFromColJson(col: Record<string, unknown>): Map<string, string[]> {
    try {
      const models = col.models as Record<string, { flds: unknown }> | undefined;
      if (!models || typeof models !== 'object') {
        return new Map();
      }

      // Build map using string IDs (convert from numeric keys in col.json)
      const rows = Object.entries(models)
        .map(([mid, model]) => ({ id: mid, flds: model?.flds }));

      return this.buildNotetypeFieldsMapFromRows(rows);
    } catch {
      return new Map();
    }
  }

  /**
   * Replace media references in field values
   * Converts Anki media references (numeric or original filenames) to Echoe storage filenames
   * Handles:
   * - [sound:123] or [sound:actual.mp3] -> [sound:stored-filename.mp3]
   * - <img src="123"> or <img src="actual.jpg"> -> <img src="stored-filename.jpg">
   */
  private replaceMediaReferences(
    value: string,
    mediaManifest: Map<string, string>,
    mediaFilenameMap: Map<string, string>
  ): string {
    // Replace [sound:...] patterns
    value = value.replace(/\[sound:([^\]]+)\]/g, (match, filename) => {
      // First resolve numeric filename to actual filename if needed
      const actualFilename = mediaManifest.get(filename) || filename;
      // Then get stored filename from upload result
      const storedFilename = mediaFilenameMap.get(actualFilename);
      if (storedFilename) {
        return `[sound:${storedFilename}]`;
      }
      return match;
    });

    // Replace <img src="..."> patterns
    value = value.replace(/<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi, (match, before, filename, after) => {
      // First resolve numeric filename to actual filename if needed
      const actualFilename = mediaManifest.get(filename) || filename;
      // Then get stored filename from upload result
      const storedFilename = mediaFilenameMap.get(actualFilename);
      if (storedFilename) {
        return `<img${before} src="${storedFilename}"${after}>`;
      }
      return match;
    });

    return value;
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
    sourceDb: DatabaseType,
    _col: Record<string, unknown>,
    referenceMap: ImportReferenceMap
  ): Promise<{ added: number; updated: number; errors: string[]; fsrsBackfilledFromRevlog: number; fsrsNewCards: number; fsrsHeuristic: number }> {
    return this.importCardsRows(uid, sourceDb, 'Could not read revlog for FSRS backfill', referenceMap);
  }

  /**
   * Import revlog from Standard Anki SQLite database
   */
  private async importRevlogFromStandardAnki(
    uid: string,
    sourceDb: DatabaseType,
    referenceMap: ImportReferenceMap
  ): Promise<number> {
    try {
      const rows = sourceDb.prepare('SELECT * FROM revlog').all() as EchoeRevlogRow[];
      return this.importRevlogRows(uid, rows, { difficultyFallback: FSRS_DIFFICULTY_FALLBACK }, referenceMap);
    } catch (error) {
      logger.error('Failed to import revlog:', error);
      return 0;
    }
  }

  /**
   * Import media files from Standard Anki package
   * Supports both official format (numeric filenames + media manifest) and legacy format (media/ subdirectory).
   * Returns count of imported files and mapping of original filenames to stored filenames.
   */
  private async importMediaFromStandardAnki(uid: string, zip: JSZip, mediaManifest: Map<string, string>): Promise<{ count: number; filenameMap: Map<string, string>; errors: string[] }> {
    const mediaFiles = this.collectMediaPaths(zip, true);
    return this.importMediaEntries(uid, zip, mediaFiles, mediaManifest);
  }

  /**
   * Legacy import - kept for backward compatibility
   */
  private async importNotetypes(
    uid: string,
    sourceDb: DatabaseType,
    referenceMap: ImportReferenceMap
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
          const sourceMid = this.getSourceIdKey(row.id);

          // Parse JSON fields
          const tmpls = row.tmpls || '[]';
          const flds = row.flds || '[]';

          // Check if notetype already exists in user scope
          const existing = await db
            .select({ noteTypeId: echoeNotetypes.noteTypeId })
            .from(echoeNotetypes)
            .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.name, row.name), eq(echoeNotetypes.deletedAt, 0)))
            .limit(1);

          let noteTypeId = existing[0]?.noteTypeId;

          if (!noteTypeId) {
            noteTypeId = generateTypeId(OBJECT_TYPE.ECHOE_NOTETYPE);

            await db.insert(echoeNotetypes).values({
              noteTypeId,
              uid,
              name: row.name,
              mod: row.mod,
              usn: row.usn,
              sortf: row.sortf,
              did: '',
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

          referenceMap.midToNoteTypeId.set(sourceMid, noteTypeId);
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
    sourceDb: DatabaseType,
    referenceMap: ImportReferenceMap
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
          const sourceDid = this.getSourceIdKey(row.id);
          const sourceMid = this.getSourceIdKey(row.mid);

          // Check if deck already exists in user scope
          const existing = await db
            .select({ deckId: echoeDecks.deckId })
            .from(echoeDecks)
            .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.name, row.name), eq(echoeDecks.deletedAt, 0)))
            .limit(1);

          let deckId = existing[0]?.deckId;

          if (!deckId) {
            deckId = generateTypeId(OBJECT_TYPE.ECHOE_DECK);

            // Resolve and validate mid (notetype) relation
            const mappedMid = referenceMap.midToNoteTypeId.get(sourceMid);
            let validatedMid: string | null = null;

            if (mappedMid) {
              // Validate that the mapped notetype exists in the database within the same uid
              const notetypeExists = await db
                .select({ noteTypeId: echoeNotetypes.noteTypeId })
                .from(echoeNotetypes)
                .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, mappedMid), eq(echoeNotetypes.deletedAt, 0)))
                .limit(1);

              if (notetypeExists.length > 0) {
                validatedMid = mappedMid;
              } else {
                errors.push(`Invalid relation: Note type '${mappedMid}' not found for field 'mid' (notetypeId) in deck ${row.name} - setting to null`);
              }
            }

            await db.insert(echoeDecks).values({
              deckId,
              uid,
              name: row.name,
              conf: '',
              extendNew: row.extendNew || 20,
              extendRev: row.extendRev || 200,
              usn: row.usn,
              lim: row.lim || 0,
              collapsed: row.collapsed || 0,
              dyn: row.dyn || 0,
              mod: row.mod,
              desc: row.desc || '',
              mid: validatedMid,
            });
            added++;
          }

          referenceMap.didToDeckId.set(sourceDid, deckId);
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
   * Import a single deck with a custom name (for deckName option) from legacy format
   */
  private async importSingleDeckFromDb(
    uid: string,
    sourceDb: DatabaseType,
    deckName: string,
    referenceMap: ImportReferenceMap
  ): Promise<{ added: number; errors: string[] }> {
    const errors: string[] = [];
    let added = 0;

    try {
      const db = getDatabase();

      // Check if deck already exists in user scope by name
      const existing = await db
        .select({ deckId: echoeDecks.deckId })
        .from(echoeDecks)
        .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.name, deckName), eq(echoeDecks.deletedAt, 0)))
        .limit(1);

      let deckId = existing[0]?.deckId;

      if (!deckId) {
        // Generate new business ID for imported deck
        deckId = generateTypeId(OBJECT_TYPE.ECHOE_DECK);

        await db.insert(echoeDecks).values({
          deckId,
          uid,
          name: deckName,
          conf: '',
          extendNew: 20,
          extendRev: 200,
          usn: 0,
          lim: 0,
          collapsed: 0,
          dyn: 0,
          mod: Math.floor(Date.now() / 1000),
          desc: '',
          mid: null,
        });
        added++;
      }

      // Get all deck IDs from the source database and map them to our new deck
      const rows = sourceDb.prepare('SELECT id FROM decks').all() as { id: number }[];
      for (const row of rows) {
        const sourceDid = this.getSourceIdKey(row.id);
        referenceMap.didToDeckId.set(sourceDid, deckId);
      }
    } catch (error) {
      errors.push(`Failed to import deck ${deckName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { added, errors };
  }

  /**
   * Build a map of notetype id → ordered field names by reading from the source database.
   * Anki's notetypes.flds is a JSON array of field definition objects, each with a "name" property.
   */
  private buildNotetypeFieldsMap(sourceDb: DatabaseType): Map<string, string[]> {
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
    sourceDb: DatabaseType,
    referenceMap: ImportReferenceMap
  ): Promise<{ added: number; updated: number; skipped: number; errors: string[] }> {
    try {
      const rows = sourceDb.prepare('SELECT * FROM notes').all() as EchoeNoteRow[];
      const notetypeFieldsMap = this.buildNotetypeFieldsMap(sourceDb);
      return await this.importNotesRows(uid, rows, notetypeFieldsMap, undefined, undefined, referenceMap);
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
    sourceDb: DatabaseType,
    referenceMap: ImportReferenceMap
  ): Promise<{ added: number; updated: number; errors: string[]; fsrsBackfilledFromRevlog: number; fsrsNewCards: number; fsrsHeuristic: number }> {
    return this.importCardsRows(uid, sourceDb, 'Could not read revlog for FSRS backfill in legacy import', referenceMap);
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
  private async importRevlog(
    uid: string,
    sourceDb: DatabaseType,
    referenceMap: ImportReferenceMap
  ): Promise<number> {
    try {
      const rows = sourceDb.prepare('SELECT * FROM revlog').all() as EchoeRevlogRow[];
      return this.importRevlogRows(uid, rows, { difficultyFallback: FSRS_DIFFICULTY_FALLBACK }, referenceMap);
    } catch (error) {
      logger.error('Failed to import revlog:', error);
      return 0;
    }
  }

  /**
   * Import media files from the zip archive (legacy format)
   */
  private async importMedia(uid: string, zip: JSZip): Promise<{ count: number; filenameMap: Map<string, string>; errors: string[] }> {
    const mediaFiles = this.collectMediaPaths(zip, false);
    return this.importMediaEntries(uid, zip, mediaFiles);
  }

  private buildNotetypeFieldsMapFromRows(rows: Array<{ id: string | number; flds: unknown }>): Map<string, string[]> {
    const map = new Map<string, string[]>();

    for (const row of rows) {
      try {
        const fieldDefs = this.parseNotetypeFieldDefs(row.flds);
        // Convert numeric IDs to strings for consistency
        map.set(String(row.id), fieldDefs.map((field) => field.name));
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
    notetypeFieldsMap: Map<string, string[]>,
    mediaManifest: Map<string, string> | undefined,
    mediaFilenameMap: Map<string, string> | undefined,
    referenceMap: ImportReferenceMap
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
        const sourceMid = this.getSourceIdKey(row.mid);
        const sourceNid = this.getSourceIdKey(row.id);
        const mappedMid = referenceMap.midToNoteTypeId.get(sourceMid);

        if (!mappedMid) {
          skipped++;
          errors.push(`Skipped note ${row.guid}: missing notetype mapping for source mid ${sourceMid}`);
          continue;
        }

        // Validate that the mapped notetype exists in the database within the same uid
        const notetypeExists = await db
          .select({ noteTypeId: echoeNotetypes.noteTypeId })
          .from(echoeNotetypes)
          .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, mappedMid), eq(echoeNotetypes.deletedAt, 0)))
          .limit(1);

        if (notetypeExists.length === 0) {
          skipped++;
          errors.push(`Invalid relation: Note type '${mappedMid}' not found for field 'mid' (notetypeId) in note ${row.guid}`);
          continue;
        }

        // Convert numeric mid to string for source map lookup
        const notetypeFields = notetypeFieldsMap.get(sourceMid) ?? [];

        const rawValues = row.flds.split('\x1f');
        const fields: Record<string, string> = {};
        for (let i = 0; i < notetypeFields.length; i++) {
          let value = rawValues[i] ?? '';
          if (mediaManifest && mediaFilenameMap) {
            value = this.replaceMediaReferences(value, mediaManifest, mediaFilenameMap);
          }
          fields[notetypeFields[i]] = value;
        }

        // Convert HTML fields to TipTap JSON format for richTextFields
        const richTextFields: RichTextFields = {};
        for (const [fieldName, fieldValue] of Object.entries(fields)) {
          if (fieldValue) {
            richTextFields[fieldName] = parseHtmlToJson(fieldValue);
          }
        }

        const normalized = normalizeNoteFields({ notetypeFields, fields, richTextFields });

        // Check for existing note in user scope (uid, guid)
        const existing = await db
          .select({ noteId: echoeNotes.noteId })
          .from(echoeNotes)
          .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.guid, row.guid), eq(echoeNotes.deletedAt, 0)))
          .limit(1);

        if (existing.length > 0) {
          const noteId = existing[0].noteId;
          referenceMap.nidToNoteId.set(sourceNid, noteId);

          await db
            .update(echoeNotes)
            .set({
              mid: mappedMid,
              mod: row.mod,
              tags: row.tags || '[]',
              flds: normalized.flds,
              sfld: normalized.sfld,
              csum: normalized.csum,
              fldNames: normalized.fldNames,
              fieldsJson: normalized.fieldsJson,
              richTextFields,
            })
            .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.guid, row.guid)));
          updated++;
        } else {
          const noteId = generateTypeId(OBJECT_TYPE.ECHOE_NOTE);
          referenceMap.nidToNoteId.set(sourceNid, noteId);

          const newNote: NewEchoeNotes = {
            noteId,
            uid,
            guid: row.guid,
            mid: mappedMid,
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
            richTextFields,
          };
          await db.insert(echoeNotes).values(newNote).ignore();
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

  private buildLatestRevlogMap(sourceDb: DatabaseType, warnMessage: string): Map<number, EchoeRevlogRow> {
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

  private async isCardNoteBindingAllowed(uid: string, noteId: string): Promise<boolean> {
    const db = getDatabase();
    const noteOwner = await db.query.echoeNotes.findFirst({
      columns: { uid: true },
      where: and(eq(echoeNotes.noteId, noteId), eq(echoeNotes.uid, uid)),
    });

    return noteOwner !== undefined;
  }

  private async importCardsRows(
    uid: string,
    sourceDb: DatabaseType,
    revlogWarnMessage: string,
    referenceMap: ImportReferenceMap
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
          const sourceNid = this.getSourceIdKey(row.nid);
          const sourceDid = this.getSourceIdKey(row.did);
          const sourceCid = this.getSourceIdKey(row.id);

          const mappedNid = referenceMap.nidToNoteId.get(sourceNid);
          const mappedDid = referenceMap.didToDeckId.get(sourceDid);

          if (!mappedNid) {
            errors.push(`Skipped card ${row.id}: missing note mapping for source nid ${sourceNid}`);
            continue;
          }

          if (!mappedDid) {
            errors.push(`Skipped card ${row.id}: missing deck mapping for source did ${sourceDid}`);
            continue;
          }

          // Validate that the mapped note exists in the database within the same uid
          const noteExists = await db
            .select({ noteId: echoeNotes.noteId })
            .from(echoeNotes)
            .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, mappedNid), eq(echoeNotes.deletedAt, 0)))
            .limit(1);

          if (noteExists.length === 0) {
            errors.push(`Invalid relation: Note '${mappedNid}' not found for field 'nid' (noteId) in card ${row.id}`);
            continue;
          }

          // Validate that the mapped deck exists in the database within the same uid
          const deckExists = await db
            .select({ deckId: echoeDecks.deckId })
            .from(echoeDecks)
            .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, mappedDid), eq(echoeDecks.deletedAt, 0)))
            .limit(1);

          if (deckExists.length === 0) {
            errors.push(`Invalid relation: Deck '${mappedDid}' not found for field 'did' (deckId) in card ${row.id}`);
            continue;
          }

          const existing = await db
            .select({ cardId: echoeCards.cardId })
            .from(echoeCards)
            .where(and(eq(echoeCards.uid, uid), eq(echoeCards.nid, mappedNid), eq(echoeCards.ord, row.ord), eq(echoeCards.deletedAt, 0)))
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
          const mappedOdid = row.odid > 0
            ? (referenceMap.didToDeckId.get(this.getSourceIdKey(row.odid)) ?? '')
            : '';

          const isBindingAllowed = await this.isCardNoteBindingAllowed(uid, mappedNid);
          if (!isBindingAllowed) {
            errors.push(`Skipped card ${row.id}: note ${mappedNid} belongs to another user`);
            continue;
          }

          if (existing.length > 0) {
            const cardId = existing[0].cardId;
            referenceMap.cidToCardId.set(sourceCid, cardId);

            await db
              .update(echoeCards)
              .set({
                nid: mappedNid,
                did: mappedDid,
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
                odid: mappedOdid,
                flags: row.flags,
                data: row.data || '{}',
                stability: fsrs.stability,
                difficulty: fsrs.difficulty,
                lastReview: fsrs.lastReview,
              })
              .where(and(eq(echoeCards.uid, uid), eq(echoeCards.cardId, cardId)));
            updated++;
          } else {
            const cardId = generateTypeId(OBJECT_TYPE.ECHOE_CARD);
            referenceMap.cidToCardId.set(sourceCid, cardId);

            const newCard: NewEchoeCards = {
              cardId,
              uid,
              nid: mappedNid,
              did: mappedDid,
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
              odid: mappedOdid,
              flags: row.flags,
              data: row.data || '{}',
              stability: fsrs.stability,
              difficulty: fsrs.difficulty,
              lastReview: fsrs.lastReview,
            };
            await db.insert(echoeCards).values(newCard).ignore();
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
    options: { difficultyFallback: number },
    referenceMap: ImportReferenceMap
  ): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }

    let imported = 0;
    const db = getDatabase();

    for (const row of rows) {
      try {
        const sourceCid = this.getSourceIdKey(row.cid);
        const mappedCid = referenceMap.cidToCardId.get(sourceCid);
        if (!mappedCid) {
          continue;
        }

        // Validate that the mapped card exists in the database within the same uid
        const cardExists = await db
          .select({ cardId: echoeCards.cardId })
          .from(echoeCards)
          .where(and(eq(echoeCards.uid, uid), eq(echoeCards.cardId, mappedCid), eq(echoeCards.deletedAt, 0)))
          .limit(1);

        if (cardExists.length === 0) {
          // Skip silently - revlogs for non-existent cards are expected when cards fail to import
          continue;
        }

        // Check for existing revlog in user scope by source revlog ID
        const existing = await db
          .select({ revlogId: echoeRevlog.revlogId })
          .from(echoeRevlog)
          .where(and(eq(echoeRevlog.uid, uid), eq(echoeRevlog.sourceRevlogId, row.id), eq(echoeRevlog.cid, mappedCid), eq(echoeRevlog.deletedAt, 0)))
          .limit(1);

        if (existing.length > 0) {
          continue;
        }

        const difficulty = this.resolveRevlogDifficulty(row.factor, options);
        const stability = row.ivl > 0 ? row.ivl : 1;
        const lastReview = this.resolveRevlogReviewTimestamp(row.id);
        const preStability = row.lastIvl > 0 ? row.lastIvl : 1;
        const preLastReview = lastReview - (row.lastIvl * DAY_MS);

        const revlogId = generateTypeId(OBJECT_TYPE.ECHOE_REVLOG);

        const newRevlog: NewEchoeRevlog = {
          revlogId,
          sourceRevlogId: row.id, // Store original Anki revlog ID
          cid: mappedCid,
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
          preLastReview: Math.max(preLastReview, 0),
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
  ): Promise<{ count: number; filenameMap: Map<string, string>; errors: string[] }> {
    let imported = 0;
    const filenameMap = new Map<string, string>(); // originalFilename -> storedFilename
    const errors: string[] = [];

    try {
      for (const mediaPath of mediaPaths) {
        try {
          const file = zip.file(mediaPath);
          if (!file) {
            const originalFilename = this.resolveImportMediaFilename(mediaPath, mediaManifest);
            logger.warn(`Media file not found in .apkg: ${mediaPath} (${originalFilename})`);
            errors.push(`Media file not found: ${originalFilename}`);
            continue;
          }

          const buffer = await file.async('nodebuffer');
          const originalFilename = this.resolveImportMediaFilename(mediaPath, mediaManifest);

          // Validate media file is not empty
          if (buffer.length === 0) {
            logger.warn(`Empty media file: ${mediaPath} (${originalFilename})`);
            errors.push(`Empty media file: ${originalFilename}`);
            continue;
          }

          const uploadResult = await this.mediaService.uploadMedia(uid, buffer, originalFilename);

          // Store mapping: originalFilename -> storedFilename
          filenameMap.set(originalFilename, uploadResult.filename);
          imported++;
        } catch (error) {
          const originalFilename = this.resolveImportMediaFilename(mediaPath, mediaManifest);
          logger.warn(`Failed to import media ${mediaPath}:`, error);
          errors.push(`Failed to import media ${originalFilename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      logger.error('Failed to import media:', error);
      errors.push(`Media import error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return { count: imported, filenameMap, errors };
  }
}
