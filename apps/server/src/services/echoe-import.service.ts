/**
 * Echoe Import Service
 * Handles importing .apkg files
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
        result.errors.push(...(revlogResult > 0 ? [] : []));

        // Import media files
        const mediaResult = await this.importMedia(zip, db);
        result.mediaImported = mediaResult;
      } finally {
        db.close();
      }
    } catch (error) {
      logger.error('Import error:', error);
      result.errors.push(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Import notetypes from source database
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

      const db = getDatabase();

      for (const row of rows) {
        try {
          // Check if note with same guid already exists
          const existing = await db
            .select({ id: echoeNotes.id })
            .from(echoeNotes)
            .where(eq(echoeNotes.guid, row.guid))
            .limit(1);

          if (existing.length > 0) {
            // Update existing note (only update mod, tags, flds)
            await db
              .update(echoeNotes)
              .set({
                mod: row.mod,
                tags: row.tags || '[]',
                flds: row.flds,
                sfld: row.sfld,
                csum: row.csum,
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
              flds: row.flds,
              sfld: row.sfld,
              csum: row.csum,
              flags: row.flags || 0,
              data: row.data || '{}',
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
