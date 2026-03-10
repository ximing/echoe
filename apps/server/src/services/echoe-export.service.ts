/**
 * Echoe Export Service
 * Handles exporting decks to .apkg files
 */

import Database from 'better-sqlite3';
import JSZip from 'jszip';
import { Service, Inject } from 'typedi';
import { eq, inArray } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeRevlog } from '../db/schema/echoe-revlog.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { echoeMedia } from '../db/schema/echoe-media.js';
import { EchoeMediaService } from './echoe-media.service.js';
import { logger } from '../utils/logger.js';

export interface ExportOptions {
  /** Deck ID to export (if not specified, export all decks) */
  deckId?: number;
  /** Whether to include scheduling data */
  includeScheduling: boolean;
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
  async exportApkg(options: ExportOptions): Promise<ExportResult> {
    const { deckId, includeScheduling } = options;

    // Create a temporary SQLite database
    const tempDb = new Database(':memory:');

    try {
      // Create schema in the temp database
      this.createEchoeSchema(tempDb);

      // Get deck(s) to export
      const decksToExport = await this.getDecksToExport(deckId);
      if (decksToExport.length === 0) {
        throw new Error('No decks found to export');
      }

      // Get all deck IDs including sub-decks
      const deckIds = this.getAllDeckIds(decksToExport);

      // Get notes in the deck(s)
      const notes = await this.getNotesInDecks(deckIds);

      // Export notetypes
      const notetypeIds = await this.exportNotetypes(tempDb, notes);

      // Export decks
      await this.exportDecks(tempDb, decksToExport);

      // Export notes
      await this.exportNotes(tempDb, notes);

      // Export cards
      const cardCount = await this.exportCards(tempDb, notes, includeScheduling);

      // Export revlog if scheduling is included
      if (includeScheduling) {
        await this.exportRevlog(tempDb, notes);
      }

      // Export media files
      const mediaCount = await this.exportMedia(tempDb, notes);

      logger.info(`Exported: ${notes.length} notes, ${cardCount} cards, ${mediaCount} media files`);

      // Get the SQLite buffer
      const sqliteBuffer = (tempDb as any).export();

      // Create the zip file
      const zip = new JSZip();
      zip.file('collection.anki21', sqliteBuffer);

      // Add media files to the zip
      await this.addMediaToZip(zip, notes);

      // Generate the final .apkg buffer
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      // Generate filename
      const deckName = deckId
        ? decksToExport.find((d) => d.id === deckId)?.name || 'deck'
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
  private async getDecksToExport(deckId?: number) {
    const db = getDatabase();

    if (deckId) {
      const deck = await db
        .select()
        .from(echoeDecks)
        .where(eq(echoeDecks.id, deckId))
        .limit(1);

      if (deck.length === 0) {
        return [];
      }

      // Get all sub-decks
      const deckName = deck[0].name;
      const subDecks = await db
        .select()
        .from(echoeDecks)
        .where(eq(echoeDecks.dyn, 0)); // Exclude filtered decks

      return subDecks.filter((d) => d.name.startsWith(deckName + '::') || d.name === deckName);
    }

    // Export all decks (excluding filtered decks)
    return db.select().from(echoeDecks).where(eq(echoeDecks.dyn, 0));
  }

  /**
   * Get all deck IDs including sub-decks
   */
  private getAllDeckIds(decks: { id: number; name: string }[]): number[] {
    return decks.map((d) => d.id);
  }

  /**
   * Get notes in the specified decks
   */
  private async getNotesInDecks(deckIds: number[]) {
    if (deckIds.length === 0) return [];

    const db = getDatabase();

    // Get all cards in the decks
    const cards = await db
      .select({ nid: echoeCards.nid })
      .from(echoeCards)
      .where(inArray(echoeCards.did, deckIds));

    // Get unique note IDs (convert bigint to number)
    const noteIds = [...new Set(cards.map((c) => Number(c.nid)))] as number[];

    if (noteIds.length === 0) return [];

    // Get the notes
    const notes = await db.select().from(echoeNotes).where(inArray(echoeNotes.id, noteIds));

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
   * Export notetypes to temp database
   */
  private async exportNotetypes(
    tempDb: Database.Database,
    notes: { mid: number }[]
  ): Promise<number[]> {
    if (notes.length === 0) return [];

    const db = getDatabase();

    // Get unique notetype IDs used by the notes
    const notetypeIds = [...new Set(notes.map((n) => n.mid))];

    if (notetypeIds.length === 0) return [];

    // Get notetypes from database
    const notetypes = await db
      .select()
      .from(echoeNotetypes)
      .where(inArray(echoeNotetypes.id, notetypeIds));

    // Insert into temp database
    const stmt = tempDb.prepare(`
      INSERT INTO notetypes (id, name, mtime, mod, usn, sortf, did, tmpls, flds, css, type, latexPre, latexPost, req)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const nt of notetypes) {
      const mtime = Math.floor(Date.now() / 1000);
      stmt.run(nt.id, nt.name, mtime, nt.mod, -1, nt.sortf, nt.did, nt.tmpls, nt.flds, nt.css, nt.type, nt.latexPre, nt.latexPost, nt.req);
    }

    return notetypes.map((nt) => nt.id);
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
    tempDb: Database.Database,
    notes: { id: number }[],
    includeScheduling: boolean
  ): Promise<number> {
    if (notes.length === 0) return 0;

    const db = getDatabase();

    // Get all cards for these notes
    const noteIds = notes.map((n) => n.id);
    const cards = await db.select().from(echoeCards).where(inArray(echoeCards.nid, noteIds));

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

      if (!includeScheduling) {
        // Export as clean new cards
        type = 0;
        queue = 0;
        due = position;
        ivl = 0;
        factor = 2500;
        reps = 0;
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
        card.lapses || 0,
        card.left || 0,
        card.odue || 0,
        card.odid || 0,
        card.flags || 0,
        card.data || '{}'
      );
    }

    return cards.length;
  }

  /**
   * Export revlog entries to temp database
   */
  private async exportRevlog(tempDb: Database.Database, notes: { id: number }[]) {
    if (notes.length === 0) return;

    const db = getDatabase();

    // Get all cards for these notes
    const noteIds = notes.map((n) => n.id);
    const cards = await db.select({ id: echoeCards.id }).from(echoeCards).where(inArray(echoeCards.nid, noteIds));

    if (cards.length === 0) return;

    const cardIds = cards.map((c) => c.id);

    // Get revlog entries for these cards
    const revlogs = await db.select().from(echoeRevlog).where(inArray(echoeRevlog.cid, cardIds));

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
  private async exportMedia(tempDb: Database.Database, notes: { flds: string }[]): Promise<number> {
    // Extract media references from note fields
    const mediaFiles = new Set<string>();

    const soundPattern = /\[sound:([^\]]+)\]/g;
    const imgPattern = /<img[^>]+src=["']([^"']+)["']/g;

    for (const note of notes) {
      const flds = note.flds || '';
      let match;

      while ((match = soundPattern.exec(flds)) !== null) {
        mediaFiles.add(match[1]);
      }

      while ((match = imgPattern.exec(flds)) !== null) {
        const src = match[1];
        const filename = src.split('/').pop() || src;
        mediaFiles.add(filename);
      }
    }

    if (mediaFiles.size === 0) return 0;

    // Get media info from database
    const db = getDatabase();
    const mediaRecords = await db
      .select()
      .from(echoeMedia)
      .where(inArray(echoeMedia.filename, [...mediaFiles]));

    // Create media table in temp DB
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
  private async addMediaToZip(zip: JSZip, notes: { flds: string }[]) {
    // Extract media references from note fields
    const mediaFiles = new Set<string>();

    const soundPattern = /\[sound:([^\]]+)\]/g;
    const imgPattern = /<img[^>]+src=["']([^"']+)["']/g;

    for (const note of notes) {
      const flds = note.flds || '';
      let match;

      while ((match = soundPattern.exec(flds)) !== null) {
        mediaFiles.add(match[1]);
      }

      while ((match = imgPattern.exec(flds)) !== null) {
        const src = match[1];
        const filename = src.split('/').pop() || src;
        mediaFiles.add(filename);
      }
    }

    if (mediaFiles.size === 0) return;

    // Get media from storage
    for (const filename of mediaFiles) {
      try {
        const media = await this.mediaService.getMedia(filename);
        if (media) {
          zip.file(`media/${filename}`, media.buffer);
        }
      } catch (error) {
        logger.warn(`Failed to add media ${filename} to export:`, error);
      }
    }
  }
}
