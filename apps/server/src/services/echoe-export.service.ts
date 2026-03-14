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
import { EchoeMediaService } from './echoe-media.service.js';
import { logger } from '../utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SECOND_MS = 1000;
const LIKELY_MS_TIMESTAMP_MIN = 100_000_000_000;

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

      // Get all deck IDs including sub-decks
      const deckIds = this.getAllDeckIds(decksToExport);

      // Get notes in the deck(s)
      const notes = await this.getNotesInDecks(uid, deckIds);

      // Export notetypes (as models in col.json)
      const models = await this.exportModelsForStandardAnki(uid, tempDb, notes);

      // Export decks
      const decks = await this.exportDecksForStandardAnki(tempDb, decksToExport);

      // Get deck config
      const dconf = this.getDeckConfigForStandardAnki();

      // Export notes
      await this.exportNotes(tempDb, notes);

      // Export cards
      const cardCount = await this.exportCards(uid, tempDb, notes, includeScheduling);

      // Export revlog if scheduling is included
      if (includeScheduling) {
        await this.exportRevlog(uid, tempDb, notes);
      }

      // Export media files
      const mediaFiles = await this.getMediaFilesForExport(notes);

      logger.info(`Exported: ${notes.length} notes, ${cardCount} cards, ${mediaFiles.size} media files`);

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

      // Get all deck IDs including sub-decks
      const deckIds = this.getAllDeckIds(decksToExport);

      // Get notes in the deck(s)
      const notes = await this.getNotesInDecks(uid, deckIds);

      // Export notetypes
      const notetypeIds = await this.exportNotetypes(uid, tempDb, notes);

      // Export decks
      await this.exportDecks(tempDb, decksToExport);

      // Export notes
      await this.exportNotes(tempDb, notes);

      // Export cards
      const cardCount = await this.exportCards(uid, tempDb, notes, includeScheduling);

      // Export revlog if scheduling is included
      if (includeScheduling) {
        await this.exportRevlog(uid, tempDb, notes);
      }

      // Export media files
      const mediaCount = await this.exportMedia(uid, tempDb, notes);

      logger.info(`Exported: ${notes.length} notes, ${cardCount} cards, ${mediaCount} media files`);

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
  private async getDecksToExport(uid: string, deckId?: string) {
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

      return subDecks.filter((d: { name: string }) => d.name.startsWith(deckName + '::') || d.name === deckName);
    }

    // Export all decks (excluding filtered decks) in user scope
    return db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.dyn, 0)));
  }

  /**
   * Get all deck IDs including sub-decks
   */
  private getAllDeckIds(decks: { deckId: string; name: string }[]): string[] {
    return decks.map((d) => d.deckId);
  }

  /**
   * Get notes in the specified decks
   */
  private async getNotesInDecks(uid: string, deckIds: string[]) {
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

    return notes;
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
    tempDb: Database.Database,
    notes: { mid: number }[]
  ): Promise<Record<number, any>> {
    if (notes.length === 0) return {};

    const db = getDatabase();

    // Get unique notetype IDs used by the notes
    const notetypeIds = [...new Set(notes.map((n) => n.mid))];

    if (notetypeIds.length === 0) return {};

    // Get notetypes from database for this user
    const notetypes = await db
      .select()
      .from(echoeNotetypes)
      .where(and(eq(echoeNotetypes.uid, uid), inArray(echoeNotetypes.id, notetypeIds)));

    // Build models JSON for col.json
    const models: Record<number, any> = {};

    for (const nt of notetypes) {
      // Parse the notetype fields and templates
      let tmpls = [];
      let flds = [];
      try {
        tmpls = typeof nt.tmpls === 'string' ? JSON.parse(nt.tmpls) : nt.tmpls;
        flds = typeof nt.flds === 'string' ? JSON.parse(nt.flds) : nt.flds;
      } catch {
        tmpls = [];
        flds = [];
      }

      // Convert to Standard Anki model format
      const model: any = {
        id: nt.id,
        name: nt.name,
        type: nt.type || 0,
        mod: nt.mod || Math.floor(Date.now() / 1000),
        usn: -1,
        sortf: nt.sortf || 0,
        did: nt.did || null,
        tmpls: tmpls,
        flds: flds,
        css: nt.css || '',
        req: typeof nt.req === 'string' ? JSON.parse(nt.req) : nt.req || [],
      };

      // Add LaTeX config
      if (nt.latexPre) {
        (model as any).latexPre = nt.latexPre;
      }
      if (nt.latexPost) {
        (model as any).latexPost = nt.latexPost;
      }

      models[nt.id] = model;
    }

    return models;
  }

  /**
   * Export decks for Standard Anki format and return decks JSON
   */
  private async exportDecksForStandardAnki(
    tempDb: Database.Database,
    decks: { id: number; name: string; conf: number; mod: number; desc: string; dyn: number; collapsed: number }[]
  ): Promise<Record<number, any>> {
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
    notes: { mid: number }[]
  ): Promise<number[]> {
    if (notes.length === 0) return [];

    const db = getDatabase();

    // Get unique notetype IDs used by the notes
    const notetypeIds = [...new Set(notes.map((n) => n.mid))];

    if (notetypeIds.length === 0) return [];

    // Get notetypes from database for this user
    const notetypes = await db
      .select()
      .from(echoeNotetypes)
      .where(and(eq(echoeNotetypes.uid, uid), inArray(echoeNotetypes.id, notetypeIds)));

    // Insert into temp database
    const stmt = tempDb.prepare(`
      INSERT INTO notetypes (id, name, mtime, mod, usn, sortf, did, tmpls, flds, css, type, latexPre, latexPost, req)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const nt of notetypes) {
      const mtime = Math.floor(Date.now() / 1000);
      stmt.run(nt.id, nt.name, mtime, nt.mod, -1, nt.sortf, nt.did, nt.tmpls, nt.flds, nt.css, nt.type, nt.latexPre, nt.latexPost, nt.req);
    }

    return notetypes.map((nt: { id: number }) => nt.id);
  }

  /**
   * Export decks to temp database
   */
  private async exportDecks(
    tempDb: Database.Database,
    decks: { id: number; name: string; conf: number; mod: number; desc: string; dyn: number; collapsed: number; extendNew: number; extendRev: number; mid: number; lim: number }[]
  ) {
    const stmt = tempDb.prepare(`
      INSERT INTO decks (id, name, mtime, mod, usn, collapsed, dyn, desc, conf, extendNew, extendRev, did, lim, mid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = Math.floor(Date.now() / 1000);

    for (const deck of decks) {
      stmt.run(
        deck.id,
        deck.name,
        now,
        deck.mod || now,
        -1,
        deck.collapsed || 0,
        deck.dyn || 0,
        deck.desc || '',
        deck.conf || 1,
        deck.extendNew || 20,
        deck.extendRev || 200,
        0,
        deck.lim || 0,
        deck.mid || 0
      );
    }
  }

  /**
   * Export notes to temp database
   */
  private async exportNotes(
    tempDb: Database.Database,
    notes: { id: number; guid: string; mid: number; mod: number; usn: number; tags: string; flds: string; sfld: string; csum: number; flags: number; data: string }[]
  ) {
    const stmt = tempDb.prepare(`
      INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const note of notes) {
      stmt.run(
        note.id,
        note.guid,
        note.mid,
        note.mod,
        -1,
        note.tags || '[]',
        note.flds,
        note.sfld,
        note.csum,
        note.flags || 0,
        note.data || '{}'
      );
    }
  }

  /**
   * Export cards to temp database
   */
  private async exportCards(
    uid: string,
    tempDb: Database.Database,
    notes: { id: number; noteId: string }[],
    includeScheduling: boolean
  ): Promise<number> {
    if (notes.length === 0) return 0;

    const db = getDatabase();

    // Get all cards for these notes in user scope (use business IDs)
    const noteIds = notes.map((n) => n.noteId);
    const cards = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.nid, noteIds)));

    const stmt = tempDb.prepare(`
      INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let position = 0;
    for (const card of cards) {
      position++;

      let type = card.type;
      let queue = card.queue;
      let due = card.due;
      let ivl = card.ivl;
      let factor = card.factor;
      let reps = card.reps;
      let lapses = card.lapses || 0;
      let left = card.left || 0;
      let odue = card.odue || 0;
      let odid = card.odid || 0;

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
        odid = 0;
      } else {
        due = this.convertDueToAnkiUnit(due, queue, type, position);
        odue = this.convertDueToAnkiUnit(odue, type, type, 0);
      }

      stmt.run(
        card.id,
        card.nid,
        card.did,
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
    }

    return cards.length;
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
  private async exportRevlog(uid: string, tempDb: Database.Database, notes: { id: number; noteId: string }[]) {
    if (notes.length === 0) return;

    const db = getDatabase();

    // Get all cards for these notes in user scope (use business IDs)
    const noteIds = notes.map((n) => n.noteId);
    const cards = await db.select({ cardId: echoeCards.cardId }).from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.nid, noteIds)));

    if (cards.length === 0) return;

    const cardIds = cards.map((c: { cardId: string }) => c.cardId);

    // Get revlog entries for these cards in user scope (use business IDs)
    const revlogs = await db.select().from(echoeRevlog).where(and(eq(echoeRevlog.uid, uid), inArray(echoeRevlog.cid, cardIds)));

    const stmt = tempDb.prepare(`
      INSERT INTO revlog (id, cid, usn, ease, ivl, lastIvl, factor, time, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const rev of revlogs) {
      stmt.run(rev.id, rev.cid, -1, rev.ease, rev.ivl, rev.lastIvl, rev.factor, rev.time, rev.type);
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
