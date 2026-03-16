/**
 * Echoe Export Service
 * Handles exporting decks to .apkg files
 */

import Database from 'better-sqlite3';
import JSZip from 'jszip';
import { Service, Inject } from 'typedi';
import { eq, inArray, and } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeRevlog } from '../db/schema/echoe-revlog.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { echoeMedia } from '../db/schema/echoe-media.js';
import { logger } from '../utils/logger.js';

import { EchoeMediaService } from './echoe-media.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SECOND_MS = 1000;
const LIKELY_MS_TIMESTAMP_MIN = 100_000_000_000;

type ExportDeckRow = {
  id: number;
  deckId: string;
  name: string;
  conf: string;
  mod: number;
  desc: string;
  dyn: number;
  collapsed: number;
  extendNew: number;
  extendRev: number;
  mid: string;
  lim: number;
};

type ExportNoteRow = {
  id: number;
  noteId: string;
  guid: string;
  mid: string;
  mod: number;
  tags: string;
  flds: string;
  sfld: string;
  csum: string;
  flags: number;
  data: string;
};

type ExportCardRow = {
  id: number;
  cardId: string;
  nid: string;
  did: string;
  ord: number;
  mod: number;
  type: number;
  queue: number;
  due: number;
  ivl: number;
  factor: number;
  reps: number;
  lapses: number;
  left: number;
  odue: number;
  odid: string;
  flags: number;
  data: string;
};

interface ExportCardsResult {
  cardCount: number;
  cardIdToCid: Map<string, number>;
}

export interface ExportOptions {
  /** Deck ID to export (if not specified, export all decks) */
  deckId?: string;
  /** Whether to include scheduling data */
  includeScheduling: boolean;
  /** Export format: 'anki' (Standard Anki) or 'legacy' (Echoe format) - defaults to 'anki' */
  format?: 'anki' | 'legacy';
}

export interface ExportResult {
  /** Buffer containing the .apkg file */
  buffer: Buffer;
  /** Filename for the export */
  filename: string;
}

@Service()
export class EchoeExportService {
  constructor(@Inject(() => EchoeMediaService) private mediaService: EchoeMediaService) {}

  /**
   * Export a deck to .apkg format
   */
  async exportApkg(uid: string, options: ExportOptions): Promise<ExportResult> {
    const { deckId, includeScheduling, format = 'anki' } = options;

    if (format === 'legacy') {
      return this.exportLegacyApkg(uid, deckId, includeScheduling);
    }

    return this.exportStandardAnki(uid, deckId, includeScheduling);
  }

  /**
   * Export in Standard Anki format (col.json based)
   */
  private async exportStandardAnki(uid: string, deckId: string | undefined, includeScheduling: boolean): Promise<ExportResult> {
    // Create a temporary SQLite database
    const tempDb = new Database(':memory:');

    try {
      // Create schema in the temp database
      this.createStandardAnkiSchema(tempDb);

      // Get deck(s) to export
      const decksToExport = await this.getDecksToExport(uid, deckId);
      if (decksToExport.length === 0) {
        throw new Error('No decks found to export');
      }

      const deckIdToDid = this.buildDeckReferenceMap(decksToExport);

      // Get all deck IDs including sub-decks
      const deckIds = this.getAllDeckIds(decksToExport);

      // Get notes in the deck(s)
      const notes = await this.getNotesInDecks(uid, deckIds);

      // Export notetypes (as models in col.json)
      const { models, noteTypeIdToMid } = await this.exportModelsForStandardAnki(uid, notes, deckIdToDid);

      // Export decks
      const decks = await this.exportDecksForStandardAnki(decksToExport);

      // Get deck config
      const dconf = this.getDeckConfigForStandardAnki();

      // Export notes and build note reference map
      const noteIdToNid = await this.exportNotes(tempDb, notes, noteTypeIdToMid);

      // Export cards and build card reference map
      const { cardCount, cardIdToCid } = await this.exportCards(uid, tempDb, notes, includeScheduling, noteIdToNid, deckIdToDid);

      // Export revlog if scheduling is included
      if (includeScheduling) {
        await this.exportRevlog(uid, tempDb, cardIdToCid);
      }

      // Export media files
      const mediaFiles = await this.getMediaFilesForExport(notes);

      logger.info(`Exported: ${noteIdToNid.size} notes, ${cardCount} cards, ${mediaFiles.size} media files`);

      const colJson = this.generateColJson(models, decks, dconf);
      this.updateStandardCollection(tempDb, colJson);

      // Get the SQLite buffer
      const sqliteBuffer = (tempDb as any).export();

      // Create the zip file
      const zip = new JSZip();

      // Official Standard Anki collection filename
      zip.file('collection.anki21', sqliteBuffer);

      // Keep col.json as compatibility metadata for importers
      zip.file('col.json', JSON.stringify(colJson));

      // Add media manifest and files (root numeric filenames)
      await this.addMediaToZipStandardAnki(uid, zip, mediaFiles);

      // Generate the final .apkg buffer
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Generate filename
      const deckName = deckId
        ? decksToExport.find((d: { deckId: string; name: string }) => d.deckId === deckId)?.name || 'deck'
        : 'all_decks';
      const sanitizedName = deckName.replace(/[^a-zA-Z0-9_]/g, '_');
      const date = new Date().toISOString().split('T')[0];
      const filename = `${sanitizedName}_${date}.apkg`;

      return { buffer, filename };
    } finally {
      tempDb.close();
    }
  }

  /**
   * Export in Legacy Echoe format (collection.anki21 based)
   */
  private async exportLegacyApkg(uid: string, deckId: string | undefined, includeScheduling: boolean): Promise<ExportResult> {
    // Create a temporary SQLite database
    const tempDb = new Database(':memory:');

    try {
      // Create schema in the temp database
      this.createEchoeSchema(tempDb);

      // Get deck(s) to export
      const decksToExport = await this.getDecksToExport(uid, deckId);
      if (decksToExport.length === 0) {
        throw new Error('No decks found to export');
      }

      const deckIdToDid = this.buildDeckReferenceMap(decksToExport);

      // Get all deck IDs including sub-decks
      const deckIds = this.getAllDeckIds(decksToExport);

      // Get notes in the deck(s)
      const notes = await this.getNotesInDecks(uid, deckIds);

      // Export notetypes
      const noteTypeIdToMid = await this.exportNotetypes(uid, tempDb, notes, deckIdToDid);

      // Export decks
      await this.exportDecks(tempDb, decksToExport, noteTypeIdToMid);

      // Export notes
      const noteIdToNid = await this.exportNotes(tempDb, notes, noteTypeIdToMid);

      // Export cards
      const { cardCount, cardIdToCid } = await this.exportCards(uid, tempDb, notes, includeScheduling, noteIdToNid, deckIdToDid);

      // Export revlog if scheduling is included
      if (includeScheduling) {
        await this.exportRevlog(uid, tempDb, cardIdToCid);
      }

      // Export media files
      const mediaCount = await this.exportMedia(uid, tempDb, notes);

      logger.info(`Exported: ${noteIdToNid.size} notes, ${cardCount} cards, ${mediaCount} media files`);

      // Get the SQLite buffer
      const sqliteBuffer = (tempDb as any).export();

      // Create the zip file
      const zip = new JSZip();
      zip.file('collection.anki21', sqliteBuffer);

      // Add media files to the zip
      await this.addMediaToZip(uid, zip, notes);

      // Generate the final .apkg buffer
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Generate filename
      const deckName = deckId
        ? decksToExport.find((d: { deckId: string; name: string }) => d.deckId === deckId)?.name || 'deck'
        : 'all_decks';
      const sanitizedName = deckName.replace(/[^a-zA-Z0-9_]/g, '_');
      const date = new Date().toISOString().split('T')[0];
      const filename = `${sanitizedName}_${date}.apkg`;

      return { buffer, filename };
    } finally {
      tempDb.close();
    }
  }

  /**
   * Get decks to export (including sub-decks)
   */
  private async getDecksToExport(uid: string, deckId?: string): Promise<ExportDeckRow[]> {
    const db = getDatabase();

    if (deckId) {
      const deck = await db
        .select()
        .from(echoeDecks)
        .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, deckId)))
        .limit(1);

      if (deck.length === 0) {
        return [];
      }

      // Get all sub-decks in user scope
      const deckName = deck[0].name;
      const subDecks = await db
        .select()
        .from(echoeDecks)
        .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.dyn, 0))); // Exclude filtered decks

      return subDecks.filter((d: { name: string }) => d.name.startsWith(deckName + '::') || d.name === deckName) as ExportDeckRow[];
    }

    // Export all decks (excluding filtered decks) in user scope
    return (await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.dyn, 0)))) as ExportDeckRow[];
  }

  /**
   * Get all deck IDs including sub-decks
   */
  private getAllDeckIds(decks: ExportDeckRow[]): string[] {
    return decks.map((d) => d.deckId);
  }

  private buildDeckReferenceMap(decks: ExportDeckRow[]): Map<string, number> {
    return new Map(decks.map((deck) => [deck.deckId, deck.id]));
  }

  private parseNumericId(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.floor(value);
    }

    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return Number.parseInt(value, 10);
    }

    return null;
  }

  /**
   * Get notes in the specified decks
   */
  private async getNotesInDecks(uid: string, deckIds: string[]): Promise<ExportNoteRow[]> {
    if (deckIds.length === 0) return [];

    const db = getDatabase();

    // Get all cards in the decks for this user
    const cards = await db
      .select({ nid: echoeCards.nid })
      .from(echoeCards)
      .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.did, deckIds)));

    // Get unique note IDs (already strings, no conversion needed)
    const noteIds: string[] = [...new Set<string>(cards.map((c: { nid: string }) => c.nid))];

    if (noteIds.length === 0) return [];

    // Get the notes for this user by business ID
    const notes = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), inArray(echoeNotes.noteId, noteIds)));

    return notes as ExportNoteRow[];
  }

  /**
   * Create schema in temp database
   */
  private createEchoeSchema(db: Database.Database) {
    // Collection table
    db.exec(`
      CREATE TABLE col (
        id INTEGER PRIMARY KEY,
        crt INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        scm INTEGER NOT NULL,
        ver INTEGER NOT NULL,
        dty INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        ls INTEGER NOT NULL,
        conf TEXT NOT NULL,
        models TEXT NOT NULL,
        decks TEXT NOT NULL,
        dconf TEXT NOT NULL,
        tags TEXT NOT NULL
      );
    `);

    // Notes table
    db.exec(`
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY,
        guid TEXT NOT NULL,
        mid INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        tags TEXT NOT NULL,
        flds TEXT NOT NULL,
        sfld TEXT NOT NULL,
        csum INTEGER NOT NULL,
        flags INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX idx_notes_guid ON notes(guid);
      CREATE INDEX idx_notes_mid ON notes(mid);
      CREATE INDEX idx_notes_usn ON notes(usn);
    `);

    // Cards table
    db.exec(`
      CREATE TABLE cards (
        id INTEGER PRIMARY KEY,
        nid INTEGER NOT NULL,
        did INTEGER NOT NULL,
        ord INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        type INTEGER NOT NULL,
        queue INTEGER NOT NULL,
        due INTEGER NOT NULL,
        ivl INTEGER NOT NULL,
        factor INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        lapses INTEGER NOT NULL,
        left INTEGER NOT NULL,
        odue INTEGER NOT NULL,
        odid INTEGER NOT NULL,
        flags INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX idx_cards_nid ON cards(nid);
      CREATE INDEX idx_cards_did ON cards(did);
      CREATE INDEX idx_cards_usn ON cards(usn);
      CREATE INDEX idx_cards_queue ON cards(queue);
      CREATE INDEX idx_cards_due ON cards(due);
    `);

    // Revlog table
    db.exec(`
      CREATE TABLE revlog (
        id INTEGER PRIMARY KEY,
        cid INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        ease INTEGER NOT NULL,
        ivl INTEGER NOT NULL,
        lastIvl INTEGER NOT NULL,
        factor INTEGER NOT NULL,
        time INTEGER NOT NULL,
        type INTEGER NOT NULL
      );
      CREATE INDEX idx_revlog_cid ON revlog(cid);
      CREATE INDEX idx_revlog_usn ON revlog(usn);
    `);

    // Decks table
    db.exec(`
      CREATE TABLE decks (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        collapsed INTEGER NOT NULL,
        dyn INTEGER NOT NULL,
        desc TEXT NOT NULL,
        conf INTEGER NOT NULL,
        extendNew INTEGER NOT NULL,
        extendRev INTEGER NOT NULL,
        did INTEGER NOT NULL,
        lim INTEGER NOT NULL,
        mid INTEGER NOT NULL
      );
      CREATE INDEX idx_decks_name ON decks(name);
      CREATE INDEX idx_decks_usn ON decks(usn);
    `);

    // Deck config table
    db.exec(`
      CREATE TABLE deck_config (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        replayq INTEGER NOT NULL,
        timer INTEGER NOT NULL,
        maxTaken INTEGER NOT NULL,
        autoplay INTEGER NOT NULL,
        new_config TEXT NOT NULL,
        rev_config TEXT NOT NULL,
        lapse_config TEXT NOT NULL
      );
    `);

    // Notetypes table
    db.exec(`
      CREATE TABLE notetypes (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        sortf INTEGER NOT NULL,
        did INTEGER NOT NULL,
        tmpls TEXT NOT NULL,
        flds TEXT NOT NULL,
        css TEXT NOT NULL,
        type INTEGER NOT NULL,
        latexPre TEXT NOT NULL,
        latexPost TEXT NOT NULL,
        req TEXT NOT NULL
      );
      CREATE INDEX idx_notetypes_name ON notetypes(name);
      CREATE INDEX idx_notetypes_usn ON notetypes(usn);
    `);

    // Templates table
    db.exec(`
      CREATE TABLE templates (
        id INTEGER PRIMARY KEY,
        ntid INTEGER NOT NULL,
        name TEXT NOT NULL,
        mtime INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        ord INTEGER NOT NULL,
        qfmt TEXT NOT NULL,
        afmt TEXT NOT NULL,
        bqfmt TEXT NOT NULL,
        bafmt TEXT NOT NULL,
        did INTEGER NOT NULL
      );
    `);

    // Config table
    db.exec(`
      CREATE TABLE config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Insert default collection
    const now = Math.floor(Date.now() / 1000);
    db
      .prepare(
        `INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
         VALUES (1, ?, ?, ?, 213, 0, -1, 0, '{}', '{}', '{}', '{}', '{}')`
      )
      .run(now, now, now);
  }

  /**
   * Create Standard Anki schema in temp database
   */
  private createStandardAnkiSchema(db: Database.Database) {
    // Collection table - Standard Anki format
    db.exec(`
      CREATE TABLE col (
        id INTEGER PRIMARY KEY,
        crt INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        scm INTEGER NOT NULL,
        ver INTEGER NOT NULL,
        dty INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        ls INTEGER NOT NULL,
        conf TEXT NOT NULL,
        models TEXT NOT NULL,
        decks TEXT NOT NULL,
        dconf TEXT NOT NULL,
        tags TEXT NOT NULL
      );
    `);

    // Notes table - Standard Anki format
    db.exec(`
      CREATE TABLE notes (
        id INTEGER PRIMARY KEY,
        guid TEXT NOT NULL,
        mid INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        tags TEXT NOT NULL,
        flds TEXT NOT NULL,
        sfld TEXT NOT NULL,
        csum INTEGER NOT NULL,
        flags INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX idx_notes_guid ON notes(guid);
      CREATE INDEX idx_notes_mid ON notes(mid);
      CREATE INDEX idx_notes_usn ON notes(usn);
    `);

    // Cards table - Standard Anki format
    db.exec(`
      CREATE TABLE cards (
        id INTEGER PRIMARY KEY,
        nid INTEGER NOT NULL,
        did INTEGER NOT NULL,
        ord INTEGER NOT NULL,
        mod INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        type INTEGER NOT NULL,
        queue INTEGER NOT NULL,
        due INTEGER NOT NULL,
        ivl INTEGER NOT NULL,
        factor INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        lapses INTEGER NOT NULL,
        left INTEGER NOT NULL,
        odue INTEGER NOT NULL,
        odid INTEGER NOT NULL,
        flags INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX idx_cards_nid ON cards(nid);
      CREATE INDEX idx_cards_did ON cards(did);
      CREATE INDEX idx_cards_usn ON cards(usn);
      CREATE INDEX idx_cards_queue ON cards(queue);
      CREATE INDEX idx_cards_due ON cards(due);
    `);

    // Revlog table - Standard Anki format
    db.exec(`
      CREATE TABLE revlog (
        id INTEGER PRIMARY KEY,
        cid INTEGER NOT NULL,
        usn INTEGER NOT NULL,
        ease INTEGER NOT NULL,
        ivl INTEGER NOT NULL,
        lastIvl INTEGER NOT NULL,
        factor INTEGER NOT NULL,
        time INTEGER NOT NULL,
        type INTEGER NOT NULL
      );
      CREATE INDEX idx_revlog_cid ON revlog(cid);
      CREATE INDEX idx_revlog_usn ON revlog(usn);
    `);

    // Insert default collection
    const now = Math.floor(Date.now() / 1000);
    db
      .prepare(
        `INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags)
         VALUES (1, ?, ?, ?, 213, 0, -1, 0, '{}', '{}', '{}', '{}', '{}')`
      )
      .run(now, now, now);
  }

  /**
   * Export models (notetypes) for Standard Anki format and return models JSON
   */
  private async exportModelsForStandardAnki(
    uid: string,
    notes: Array<{ mid: string }>,
    deckIdToDid: Map<string, number>
  ): Promise<{ models: Record<number, any>; noteTypeIdToMid: Map<string, number> }> {
    if (notes.length === 0) {
      return { models: {}, noteTypeIdToMid: new Map() };
    }

    const db = getDatabase();

    // Get unique business notetype IDs used by the notes
    const noteTypeIds = [...new Set(notes.map((n) => n.mid).filter((mid): mid is string => Boolean(mid)))];

    if (noteTypeIds.length === 0) {
      return { models: {}, noteTypeIdToMid: new Map() };
    }

    // Get notetypes from database for this user
    const notetypes = await db
      .select()
      .from(echoeNotetypes)
      .where(and(eq(echoeNotetypes.uid, uid), inArray(echoeNotetypes.noteTypeId, noteTypeIds), eq(echoeNotetypes.deletedAt, 0)));

    // Build models JSON for col.json and reference map for downstream note export
    const models: Record<number, any> = {};
    const noteTypeIdToMid = new Map<string, number>();

    for (const nt of notetypes) {
      let tmpls: any[] = [];
      let flds: any[] = [];
      let req: any[] = [];
      try {
        tmpls = typeof nt.tmpls === 'string' ? JSON.parse(nt.tmpls) : nt.tmpls;
      } catch {
        tmpls = [];
      }
      try {
        flds = typeof nt.flds === 'string' ? JSON.parse(nt.flds) : nt.flds;
      } catch {
        flds = [];
      }
      try {
        req = typeof nt.req === 'string' ? JSON.parse(nt.req) : nt.req || [];
      } catch {
        req = [];
      }

      const mappedDid = deckIdToDid.get(nt.did) ?? this.parseNumericId(nt.did);

      // Convert to Standard Anki model format
      const model: any = {
        id: nt.id,
        name: nt.name,
        type: nt.type || 0,
        mod: nt.mod || Math.floor(Date.now() / 1000),
        usn: -1,
        sortf: nt.sortf || 0,
        did: mappedDid ?? null,
        tmpls,
        flds,
        css: nt.css || '',
        req,
      };

      // Add LaTeX config
      if (nt.latexPre) {
        (model as any).latexPre = nt.latexPre;
      }
      if (nt.latexPost) {
        (model as any).latexPost = nt.latexPost;
      }

      models[nt.id] = model;
      noteTypeIdToMid.set(nt.noteTypeId, nt.id);
    }

    return { models, noteTypeIdToMid };
  }

  /**
   * Export decks for Standard Anki format and return decks JSON
   */
  private async exportDecksForStandardAnki(decks: ExportDeckRow[]): Promise<Record<number, any>> {
    const decksJson: Record<number, any> = {};
    const now = Math.floor(Date.now() / 1000);

    for (const deck of decks) {
      decksJson[deck.id] = {
        id: deck.id,
        name: deck.name,
        mod: deck.mod || now,
        usn: -1,
        collapsed: deck.collapsed || 0,
        dyn: deck.dyn || 0,
        desc: deck.desc || '',
        conf: 1,
        extendNew: 20,
        extendRev: 200,
      };
    }

    return decksJson;
  }

  /**
   * Get deck config for Standard Anki format
   */
  private getDeckConfigForStandardAnki(): Record<number, any> {
    const now = Math.floor(Date.now() / 1000);

    return {
      1: {
        id: 1,
        name: 'Default',
        mod: now,
        usn: -1,
        replayq: 1,
        timer: 0,
        maxTaken: 60,
        autoplay: 1,
        new: {
          bury: true,
          editsingle: false,
          deledit: false,
          separate: true,
          add: true,
          timer: 0,
          delays: [1, 10],
          order: 1,
          perDay: 20,
          buries: true,
          learns: true,
          minSpace: 1,
        },
        rev: {
          editsingle: false,
          deledit: false,
          separate: true,
          add: false,
          timer: 0,
          perDay: 200,
          fuzz: 0.05,
          ivlFct: 1,
          maxIvl: 36500,
          bury: true,
          buries: true,
          minSpace: 1,
        },
        lapse: {
          deledit: false,
          deltimer: 0,
          minInt: 1,
          mult: 0,
          maxLapses: 8,
          delays: [10],
          relearn: 1,
          minSpace: 1,
        },
        edit: false,
        report: true,
        timeout: 60,
        undo: 1,
      },
    };
  }

  /**
   * Generate col.json content for Standard Anki export
   */
  private generateColJson(
    models: Record<number, any>,
    decks: Record<number, any>,
    dconf: Record<number, any>
  ): Record<string, any> {
    const now = Math.floor(Date.now() / 1000);
    const firstDeckId = Object.keys(decks)[0];
    // Use first deck ID or default to 1 (note: deck IDs in col.json are numeric for Anki compatibility)
    const currentDeckId = firstDeckId ? firstDeckId : '1';

    return {
      id: 1,
      crt: now - 86400, // Created yesterday
      mod: now,
      scm: now * 1000,
      ver: 213,
      dty: 0,
      usn: -1,
      ls: 0,
      conf: {
        curDeck: currentDeckId,
        newSpread: 0,
        collapseTime: 1200,
        timer: 0,
        autoplay: true,
        replayq: true,
        dueCounts: true,
        curModel: null,
        sidebarWS: 250,
        notetypeSidetoggle: true,
        showTimer: 1,
        showProgress: 1,
        browserNotesPerPane: -1,
        cardStateForUndo: 'both',
        skipMediaSanityCheck: false,
        forceFullSearch: false,
        mainWindowState: 'maximized',
        creationOffset: 0,
        timezone: null,
      },
      models,
      decks,
      dconf,
      tags: {},
    };
  }

  private updateStandardCollection(db: Database.Database, colJson: Record<string, any>) {
    db
      .prepare(
        `UPDATE col
         SET crt = ?, mod = ?, scm = ?, ver = ?, dty = ?, usn = ?, ls = ?, conf = ?, models = ?, decks = ?, dconf = ?, tags = ?
         WHERE id = ?`
      )
      .run(
        colJson.crt,
        colJson.mod,
        colJson.scm,
        colJson.ver,
        colJson.dty,
        colJson.usn,
        colJson.ls,
        JSON.stringify(colJson.conf),
        JSON.stringify(colJson.models),
        JSON.stringify(colJson.decks),
        JSON.stringify(colJson.dconf),
        JSON.stringify(colJson.tags),
        colJson.id
      );
  }

  /**
   * Get media files referenced in notes
   */
  private async getMediaFilesForExport(notes: { flds: string }[]): Promise<Set<string>> {
    return this.collectMediaFilesFromNotes(notes);
  }

  /**
   * Add media to zip with manifest for Standard Anki format
   */
  private async addMediaToZipStandardAnki(uid: string, zip: JSZip, mediaFiles: Set<string>): Promise<void> {
    const mediaManifest: Record<string, string> = {};

    if (mediaFiles.size === 0) {
      zip.file('media', JSON.stringify(mediaManifest));
      return;
    }

    const sortedMediaFiles = [...mediaFiles].sort();
    await this.addMediaFilesToZip(
      uid,
      zip,
      sortedMediaFiles,
      (_filename, index) => String(index),
      (filename, entryName) => {
        mediaManifest[entryName] = filename;
      }
    );

    zip.file('media', JSON.stringify(mediaManifest));
  }

  /**
   * Export notetypes to temp database
   */
  private async exportNotetypes(
    uid: string,
    tempDb: Database.Database,
    notes: Array<{ mid: string }>,
    deckIdToDid: Map<string, number>
  ): Promise<Map<string, number>> {
    if (notes.length === 0) return new Map();

    const db = getDatabase();

    // Get unique business notetype IDs used by the notes
    const noteTypeIds = [...new Set(notes.map((n) => n.mid).filter((mid): mid is string => Boolean(mid)))];

    if (noteTypeIds.length === 0) return new Map();

    // Get notetypes from database for this user
    const notetypes = await db
      .select()
      .from(echoeNotetypes)
      .where(and(eq(echoeNotetypes.uid, uid), inArray(echoeNotetypes.noteTypeId, noteTypeIds), eq(echoeNotetypes.deletedAt, 0)));

    // Insert into temp database
    const stmt = tempDb.prepare(`
      INSERT INTO notetypes (id, name, mtime, mod, usn, sortf, did, tmpls, flds, css, type, latexPre, latexPost, req)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const noteTypeIdToMid = new Map<string, number>();

    for (const nt of notetypes) {
      const mtime = Math.floor(Date.now() / 1000);
      const mappedDid = deckIdToDid.get(nt.did) ?? this.parseNumericId(nt.did) ?? 0;

      stmt.run(nt.id, nt.name, mtime, nt.mod, -1, nt.sortf, mappedDid, nt.tmpls, nt.flds, nt.css, nt.type, nt.latexPre, nt.latexPost, nt.req);
      noteTypeIdToMid.set(nt.noteTypeId, nt.id);
    }

    return noteTypeIdToMid;
  }

  /**
   * Export decks to temp database
   */
  private async exportDecks(tempDb: Database.Database, decks: ExportDeckRow[], noteTypeIdToMid: Map<string, number>) {
    const stmt = tempDb.prepare(`
      INSERT INTO decks (id, name, mtime, mod, usn, collapsed, dyn, desc, conf, extendNew, extendRev, did, lim, mid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Math.floor(Date.now() / 1000);

    for (const deck of decks) {
      const conf = this.parseNumericId(deck.conf) ?? 1;
      const mappedMid = noteTypeIdToMid.get(deck.mid) ?? this.parseNumericId(deck.mid) ?? 0;

      stmt.run(
        deck.id,
        deck.name,
        now,
        deck.mod || now,
        -1,
        deck.collapsed || 0,
        deck.dyn || 0,
        deck.desc || '',
        conf,
        deck.extendNew || 20,
        deck.extendRev || 200,
        0,
        deck.lim || 0,
        mappedMid
      );
    }
  }

  /**
   * Export notes to temp database
   */
  private async exportNotes(
    tempDb: Database.Database,
    notes: ExportNoteRow[],
    noteTypeIdToMid: Map<string, number>
  ): Promise<Map<string, number>> {
    const stmt = tempDb.prepare(`
      INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const noteIdToNid = new Map<string, number>();

    for (const note of notes) {
      const mappedMid = noteTypeIdToMid.get(note.mid) ?? this.parseNumericId(note.mid);
      if (mappedMid === null || mappedMid === undefined) {
        logger.warn('Skip exporting note because notetype mapping is missing', {
          noteId: note.noteId,
          noteTypeId: note.mid,
        });
        continue;
      }

      stmt.run(
        note.id,
        note.guid,
        mappedMid,
        note.mod,
        -1,
        note.tags || '[]',
        note.flds,
        note.sfld,
        parseInt(note.csum, 10) || 0,
        note.flags || 0,
        note.data || '{}'
      );
      noteIdToNid.set(note.noteId, note.id);
    }

    return noteIdToNid;
  }

  /**
   * Export cards to temp database
   */
  private async exportCards(
    uid: string,
    tempDb: Database.Database,
    notes: Array<{ noteId: string }>,
    includeScheduling: boolean,
    noteIdToNid: Map<string, number>,
    deckIdToDid: Map<string, number>
  ): Promise<ExportCardsResult> {
    if (notes.length === 0) return { cardCount: 0, cardIdToCid: new Map() };

    const db = getDatabase();

    // Get all cards for these notes in user scope (use business IDs)
    const noteIds = notes.map((n) => n.noteId);
    const cards = (await db
      .select()
      .from(echoeCards)
      .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.nid, noteIds)))) as ExportCardRow[];

    const stmt = tempDb.prepare(`
      INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let position = 0;
    let cardCount = 0;
    const cardIdToCid = new Map<string, number>();

    for (const card of cards) {
      position++;

      const mappedNid = noteIdToNid.get(card.nid) ?? this.parseNumericId(card.nid);
      const mappedDid = deckIdToDid.get(card.did) ?? this.parseNumericId(card.did);

      if (mappedNid === null || mappedNid === undefined) {
        logger.warn('Skip exporting card because note mapping is missing', {
          cardId: card.cardId,
          noteId: card.nid,
        });
        continue;
      }

      if (mappedDid === null || mappedDid === undefined) {
        logger.warn('Skip exporting card because deck mapping is missing', {
          cardId: card.cardId,
          deckId: card.did,
        });
        continue;
      }

      let type = card.type;
      let queue = card.queue;
      let due = card.due;
      let ivl = card.ivl;
      let factor = card.factor;
      let reps = card.reps;
      let lapses = card.lapses || 0;
      let left = card.left || 0;
      let odue = card.odue || 0;
      let odid = 0;

      if (!includeScheduling) {
        // Export as clean new cards
        type = 0;
        queue = 0;
        due = position;
        ivl = 0;
        factor = 2500;
        reps = 0;
        lapses = 0;
        left = 0;
        odue = 0;
      } else {
        due = this.convertDueToAnkiUnit(due, queue, type, position);
        odue = this.convertDueToAnkiUnit(odue, type, type, 0);
        odid = deckIdToDid.get(card.odid) ?? this.parseNumericId(card.odid) ?? 0;
      }

      stmt.run(
        card.id,
        mappedNid,
        mappedDid,
        card.ord,
        card.mod,
        -1,
        type,
        queue,
        due,
        ivl,
        factor,
        reps,
        lapses,
        left,
        odue,
        odid,
        card.flags || 0,
        card.data || '{}'
      );

      cardIdToCid.set(card.cardId, card.id);
      cardCount++;
    }

    return { cardCount, cardIdToCid };
  }

  /**
   * Convert Echoe due value (ms) into Anki-compatible unit by queue/type.
   */
  private convertDueToAnkiUnit(due: number, queue: number, type: number, newCardFallback: number): number {
    if (!Number.isFinite(due) || due <= 0) {
      return queue === 0 ? newCardFallback : 0;
    }

    const effectiveQueue = queue < 0 ? type : queue;

    if (effectiveQueue === 2) {
      if (due >= LIKELY_MS_TIMESTAMP_MIN) {
        return Math.max(1, Math.floor(due / DAY_MS));
      }
      return Math.max(1, Math.floor(due));
    }

    if (effectiveQueue === 1 || effectiveQueue === 3) {
      if (due >= LIKELY_MS_TIMESTAMP_MIN) {
        return Math.max(1, Math.floor(due / SECOND_MS));
      }
      return Math.max(1, Math.floor(due));
    }

    if (effectiveQueue === 0) {
      if (due >= LIKELY_MS_TIMESTAMP_MIN) {
        return Math.max(1, newCardFallback);
      }
      return Math.max(1, Math.floor(due));
    }

    return Math.floor(due);
  }

  /**
   * Export revlog entries to temp database
   */
  private async exportRevlog(uid: string, tempDb: Database.Database, cardIdToCid: Map<string, number>) {
    if (cardIdToCid.size === 0) return;

    const db = getDatabase();

    const cardIds = [...cardIdToCid.keys()];

    // Get revlog entries for exported cards in user scope (use business IDs)
    const revlogs = await db.select().from(echoeRevlog).where(and(eq(echoeRevlog.uid, uid), inArray(echoeRevlog.cid, cardIds)));

    const stmt = tempDb.prepare(`
      INSERT INTO revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rev of revlogs) {
      const mappedCid = cardIdToCid.get(rev.cid) ?? this.parseNumericId(rev.cid);
      if (mappedCid === null || mappedCid === undefined) {
        logger.warn('Skip exporting revlog because card mapping is missing', {
          revlogId: rev.id,
          cardId: rev.cid,
        });
        continue;
      }

      stmt.run(rev.id, mappedCid, -1, rev.ease, rev.ivl, rev.lastIvl, rev.factor, rev.time, rev.type);
    }
  }

  /**
   * Export media files
   */
  private async exportMedia(uid: string, tempDb: Database.Database, notes: { flds: string }[]): Promise<number> {
    const mediaFiles = this.collectMediaFilesFromNotes(notes);

    if (mediaFiles.size === 0) return 0;

    const db = getDatabase();
    const mediaRecords = await db
      .select()
      .from(echoeMedia)
      .where(and(eq(echoeMedia.uid, uid), inArray(echoeMedia.filename, [...mediaFiles])));

    tempDb.exec(`
      CREATE TABLE media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fname TEXT NOT NULL,
        fhash TEXT NOT NULL,
        size INTEGER NOT NULL,
        modified_time INTEGER NOT NULL
      );
    `);

    const stmt = tempDb.prepare(`
      INSERT INTO media (fname, fhash, size, modified_time)
      VALUES (?, ?, ?, ?)
    `);

    const now = Math.floor(Date.now() / 1000);

    for (const media of mediaRecords) {
      stmt.run(media.filename, media.hash || '', media.size || 0, now);
    }

    return mediaRecords.length;
  }

  /**
   * Add media files to the zip archive
   */
  private async addMediaToZip(uid: string, zip: JSZip, notes: { flds: string }[]) {
    const mediaFiles = [...this.collectMediaFilesFromNotes(notes)];
    if (mediaFiles.length === 0) return;

    await this.addMediaFilesToZip(uid, zip, mediaFiles, (filename) => `media/${filename}`);
  }

  private collectMediaFilesFromNotes(notes: { flds: string }[]): Set<string> {
    const mediaFiles = new Set<string>();

    const soundPattern = /\[sound:([^\]]+)\]/g;
    const imgPattern = /<img[^>]+src=["']([^"']+)["']/g;

    for (const note of notes) {
      const flds = note.flds || '';
      let match: RegExpExecArray | null;

      while ((match = soundPattern.exec(flds)) !== null) {
        mediaFiles.add(match[1]);
      }

      while ((match = imgPattern.exec(flds)) !== null) {
        const src = match[1];
        mediaFiles.add(src.split('/').pop() || src);
      }
    }

    return mediaFiles;
  }

  private async addMediaFilesToZip(
    uid: string,
    zip: JSZip,
    mediaFiles: string[],
    entryResolver: (filename: string, index: number) => string,
    onAdded?: (filename: string, entryName: string) => void
  ): Promise<void> {
    let addedCount = 0;

    for (const filename of mediaFiles) {
      try {
        const media = await this.mediaService.getMedia(uid, filename);
        if (!media) {
          continue;
        }

        const entryName = entryResolver(filename, addedCount);
        zip.file(entryName, media.buffer);
        onAdded?.(filename, entryName);
        addedCount++;
      } catch (error) {
        logger.warn(`Failed to add media ${filename} to export:`, error);
      }
    }
  }
}
