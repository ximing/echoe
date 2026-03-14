import { Service } from 'typedi';
import { eq, and, inArray, like, sql, or, desc, asc } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { echoeTemplates } from '../db/schema/echoe-templates.js';
import { echoeGraves } from '../db/schema/echoe-graves.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { echoeRevlog } from '../db/schema/echoe-revlog.js';
import { logger } from '../utils/logger.js';
import { EchoeStudyService } from './echoe-study.service.js';
import { normalizeNoteFields } from '../lib/note-field-normalizer.js';
import { generateNoteId, generateCardId, generateNoteTypeId } from '../utils/id.js';
import type { RichTextFields } from '../types/note-fields.js';
import type { EchoeCards } from '../db/schema/echoe-cards.js';
import type { EchoeNotes } from '../db/schema/echoe-notes.js';
import type { EchoeNotetypes } from '../db/schema/echoe-notetypes.js';
import type { EchoeTemplates } from '../db/schema/echoe-templates.js';

import type {
  EchoeNoteDto,
  EchoeNoteWithCardsDto,
  CreateEchoeNoteDto,
  UpdateEchoeNoteDto,
  EchoeCardDto,
  EchoeCardWithNoteDto,
  EchoeCardListItemDto,
  EchoeNoteTypeDto,
  CreateEchoeNoteTypeDto,
  UpdateEchoeNoteTypeDto,
  BulkCardOperationDto,
  EchoeNoteQueryParams,
  EchoeCardQueryParams,
} from '@echoe/dto';

@Service()
export class EchoeNoteService {
  constructor(private echoeStudyService: EchoeStudyService) {}

  /**
   * Get notes with optional filters
   */
  async getNotes(uid: string, params: EchoeNoteQueryParams): Promise<{ notes: EchoeNoteDto[]; total: number }> {
    const db = getDatabase();
    const { deckId, tags, q, status, page = 1, limit = 20 } = params;

    const conditions: any[] = [eq(echoeNotes.uid, uid)];

    // Filter by deck - find cards in deck, then get notes
    if (deckId !== undefined) {
      // Get all sub-deck IDs
      const deckIds = await this.getDeckAndSubdeckIds(uid, deckId);

      // Get cards in these decks
      const cards = await db
        .select({ nid: echoeCards.nid })
        .from(echoeCards)
        .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.did, deckIds)));

      const noteIds = Array.from(new Set(cards.map((c: Pick<EchoeCards, 'nid'>) => Number(c.nid)))) as number[];
      if (noteIds.length > 0) {
        conditions.push(inArray(echoeNotes.id, noteIds));
      } else {
        // No cards found, return empty
        return { notes: [], total: 0 };
      }
    }

    // Filter by tags
    if (tags) {
      const tagList = tags.split(',').map((t) => t.trim());
      for (const tag of tagList) {
        conditions.push(sql`${echoeNotes.tags} LIKE ${`%"${tag}"%`}`);
      }
    }

    // Filter by search query (searches sfld)
    if (q) {
      conditions.push(like(echoeNotes.sfld, `%${q}%`));
    }

    // Filter by status
    if (status) {
      const nowMs = Date.now();
      let cardConditions: any;

      switch (status) {
        case 'new':
          cardConditions = eq(echoeCards.queue, 0);
          break;
        case 'learn':
          cardConditions = sql`${echoeCards.queue} IN (1, 3)`;
          break;
        case 'review':
          cardConditions = and(eq(echoeCards.queue, 2), sql`${echoeCards.due} <= ${nowMs}`);
          break;
        case 'suspended':
          cardConditions = eq(echoeCards.queue, -1);
          break;
        case 'buried':
          cardConditions = sql`${echoeCards.queue} IN (-2, -3)`;
          break;
      }

      if (cardConditions) {
        const cards = await db.select({ nid: echoeCards.nid }).from(echoeCards).where(and(eq(echoeCards.uid, uid), cardConditions));
        const noteIds = Array.from(new Set(cards.map((c: Pick<EchoeCards, 'nid'>) => Number(c.nid)))) as number[];
        if (noteIds.length > 0) {
          conditions.push(inArray(echoeNotes.id, noteIds));
        } else {
          return { notes: [], total: 0 };
        }
      }
    }

    // Build where clause
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(echoeNotes)
      .where(whereClause);

    const total = Number(countResult[0]?.count || 0);

    // Get paginated notes
    const offset = (page - 1) * limit;
    const notes = await db
      .select()
      .from(echoeNotes)
      .where(whereClause)
      .orderBy(desc(echoeNotes.mod))
      .limit(limit)
      .offset(offset);

    return {
      notes: notes.map((n: EchoeNotes) => this.mapNoteToDto(n)),
      total,
    };
  }

  /**
   * Get a single note by ID
   */
  async getNoteById(uid: string, id: number): Promise<EchoeNoteWithCardsDto | null> {
    const db = getDatabase();

    const note = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.id, id))).limit(1);

    if (note.length === 0) {
      return null;
    }

    // Get cards for this note
    const cards = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), eq(echoeCards.nid, id)));

    return {
      ...this.mapNoteToDto(note[0]),
      cards: cards.map((c: EchoeCards) => this.mapCardToDto(c)),
    };
  }

  /**
   * Create a new note
   */
  async createNote(uid: string, dto: CreateEchoeNoteDto): Promise<EchoeNoteWithCardsDto> {
    // Get note type to determine templates (outside transaction - read only)
    const db = getDatabase();
    const notetype = await db.select().from(echoeNotetypes).where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, dto.notetypeId))).limit(1);

    if (notetype.length === 0) {
      throw new Error(`Note type ${dto.notetypeId} not found`);
    }

    // Parse templates and extract ordered field names from notetype definition
    const templates = JSON.parse(notetype[0].tmpls) as Array<{ ord: number; name: string }>;
    const notetypeFieldDefs = JSON.parse(notetype[0].flds) as Array<{ name: string; ord?: number }>;
    const notetypeFields = notetypeFieldDefs.map((f) => f.name);

    // Normalize all field values using the unified normalizer
    const normalized = normalizeNoteFields({
      notetypeFields,
      fields: dto.fields,
      richTextFields: dto.richTextFields as RichTextFields | undefined,
    });

    // Generate GUID (40 char hex string)
    const guid = this.generateGuid();

    // Build tags JSON
    const tags = dto.tags || [];
    const tagsJson = JSON.stringify(tags);

    const now = Math.floor(Date.now() / 1000);
    const noteId = generateNoteId();

    // Wrap note and card creation in a transaction
    return withTransaction(async (tx) => {
      // MySQL insert does not support returning(); fetch the inserted note explicitly.
      await tx.insert(echoeNotes).values({
        id: noteId,
        uid,
        guid,
        mid: dto.notetypeId,
        mod: now,
        usn: 0,
        tags: tagsJson,
        flds: normalized.flds,
        sfld: normalized.sfld,
        csum: normalized.csum,
        flags: 0,
        data: '{}',
        richTextFields: dto.richTextFields ?? undefined,
        fldNames: normalized.fldNames,
        fieldsJson: normalized.fieldsJson,
      });

      // Create cards for each template
      const createdCards: EchoeCardDto[] = [];

      for (const template of templates) {
        const cardId = generateCardId(template.ord);
        await tx.insert(echoeCards).values({
          id: cardId,
          uid,
          nid: noteId,
          did: dto.deckId,
          ord: template.ord,
          mod: now,
          usn: 0,
          type: 0,
          queue: 0,
          due: 0,
          ivl: 0,
          factor: 0,
          reps: 0,
          lapses: 0,
          left: 0,
          data: '{}',
        });

        createdCards.push({
          id: cardId,
          nid: noteId,
          did: dto.deckId,
          ord: template.ord,
          mod: now,
          type: 0,
          queue: 0,
          due: 0,
          ivl: 0,
          factor: 0,
          reps: 0,
          lapses: 0,
          left: 0,
          usn: 0,
          stability: 0,
          difficulty: 0,
          lastReview: 0,
        });
      }

      const insertedNote = await tx.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.id, noteId))).limit(1);

      if (insertedNote.length === 0) {
        throw new Error(`Failed to load inserted note ${noteId}`);
      }

      return {
        ...this.mapNoteToDto(insertedNote[0]),
        cards: createdCards,
      };
    });
  }

  /**
   * Update a note
   */
  async updateNote(uid: string, id: number, dto: UpdateEchoeNoteDto): Promise<EchoeNoteDto | null> {
    const db = getDatabase();

    const note = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.id, id))).limit(1);

    if (note.length === 0) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const updates: any = { mod: now, usn: 0 };

    if (dto.fields !== undefined || dto.richTextFields !== undefined) {
      // Fetch notetype to get ordered field names
      const notetype = await db
        .select()
        .from(echoeNotetypes)
        .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, note[0].mid)))
        .limit(1);

      if (notetype.length === 0) {
        throw new Error(`Note type ${note[0].mid} not found`);
      }

      const notetypeFieldDefs = JSON.parse(notetype[0].flds) as Array<{ name: string; ord?: number }>;
      const notetypeFields = notetypeFieldDefs.map((f) => f.name);

      // Normalize all field values using the unified normalizer
      const normalized = normalizeNoteFields({
        notetypeFields,
        fields: dto.fields,
        richTextFields: dto.richTextFields as RichTextFields | undefined,
      });

      updates.flds = normalized.flds;
      updates.sfld = normalized.sfld;
      updates.csum = normalized.csum;
      updates.fldNames = normalized.fldNames;
      updates.fieldsJson = normalized.fieldsJson;

      if (dto.richTextFields !== undefined) {
        updates.richTextFields = dto.richTextFields;
      }
    }

    if (dto.tags !== undefined) {
      updates.tags = JSON.stringify(dto.tags);
    }

    await db.update(echoeNotes).set(updates).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.id, id)));

    const updated = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.id, id))).limit(1);
    return this.mapNoteToDto(updated[0]);
  }

  /**
   * Delete a note
   */
  async deleteNote(uid: string, id: number): Promise<boolean> {
    const db = getDatabase();

    const note = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.id, id))).limit(1);

    if (note.length === 0) {
      return false;
    }

    // Get cards for this note
    const cards = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), eq(echoeCards.nid, id)));

    const now = Math.floor(Date.now() / 1000);

    // Add cards to graves
    for (const card of cards) {
      await db.insert(echoeGraves).values({ uid, usn: 0, oid: Number(card.id), type: 2 });
    }

    // Add note to graves
    await db.insert(echoeGraves).values({ uid, usn: 0, oid: id, type: 1 });

    // Delete cards
    await db.delete(echoeCards).where(and(eq(echoeCards.uid, uid), eq(echoeCards.nid, id)));

    // Delete note
    await db.delete(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.id, id)));

    return true;
  }

  /**
   * Get card by ID with full note data
   */
  async getCardById(uid: string, id: number): Promise<EchoeCardWithNoteDto | null> {
    const db = getDatabase();

    const card = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), eq(echoeCards.id, id))).limit(1);

    if (card.length === 0) {
      return null;
    }

    const note = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.id, card[0].nid))).limit(1);

    if (note.length === 0) {
      return null;
    }

    return {
      ...this.mapCardToDto(card[0]),
      note: this.mapNoteToDto(note[0]),
    };
  }

  /**
   * Get cards with filters for card browser
   */
  async getCards(uid: string, params: EchoeCardQueryParams): Promise<{ cards: EchoeCardListItemDto[]; total: number }> {
    const db = getDatabase();
    const { deckId, q, status, tag, sort = 'added', order = 'desc', page = 1, limit = 50 } = params;

    // Build card conditions
    let cardConditions: any[] = [eq(echoeCards.uid, uid)];

    // Filter by deck
    if (deckId !== undefined) {
      const deckIds = await this.getDeckAndSubdeckIds(uid, deckId);
      cardConditions.push(inArray(echoeCards.did, deckIds));
    }

    // Filter by status
    if (status) {
      switch (status) {
        case 'new':
          cardConditions.push(eq(echoeCards.queue, 0));
          break;
        case 'learn':
          cardConditions.push(sql`${echoeCards.queue} IN (1, 3)`);
          break;
        case 'review':
          cardConditions.push(sql`${echoeCards.queue} = 2`);
          break;
        case 'suspended':
          cardConditions.push(eq(echoeCards.queue, -1));
          break;
        case 'buried':
          cardConditions.push(sql`${echoeCards.queue} IN (-2, -3)`);
          break;
        case 'leech':
          // Get notes with leech tag
          const leechNotes = await db
            .select({ id: echoeNotes.id })
            .from(echoeNotes)
            .where(and(eq(echoeNotes.uid, uid), sql`${echoeNotes.tags} LIKE '%"leech"%'`));

          const leechNoteIds = leechNotes.map((n: Pick<EchoeNotes, 'id'>) => n.id);
          if (leechNoteIds.length > 0) {
            cardConditions.push(inArray(echoeCards.nid, leechNoteIds));
          } else {
            return { cards: [], total: 0 };
          }
          break;
      }
    }

    // Build note conditions
    let noteConditions: any[] = [eq(echoeNotes.uid, uid)];

    // Filter by search query
    if (q) {
      noteConditions.push(like(echoeNotes.sfld, `%${q}%`));
    }

    // Filter by tag
    if (tag) {
      noteConditions.push(sql`${echoeNotes.tags} LIKE ${`%"${tag}"%`}`);
    }

    // Get cards with conditions
    const whereClause = and(...cardConditions, ...noteConditions)
      ? and(...cardConditions, ...noteConditions)
      : undefined;

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(echoeCards)
      .leftJoin(echoeNotes, eq(echoeCards.nid, echoeNotes.id))
      .where(whereClause);

    const total = countResult[0]?.count || 0;

    // Apply sorting
    let orderBy: any;
    switch (sort) {
      case 'due':
        orderBy = order === 'asc' ? asc(echoeCards.due) : desc(echoeCards.due);
        break;
      case 'mod':
        orderBy = order === 'asc' ? asc(echoeCards.mod) : desc(echoeCards.mod);
        break;
      case 'added':
      default:
        // Cards don't have added date, use id which is roughly creation time
        orderBy = order === 'asc' ? asc(echoeCards.id) : desc(echoeCards.id);
        break;
    }

    // Get paginated cards
    const offset = (page - 1) * limit;
    const cards = await db
      .select({
        card: echoeCards,
        note: echoeNotes,
        deck: echoeDecks,
        notetype: echoeNotetypes,
      })
      .from(echoeCards)
      .leftJoin(echoeNotes, eq(echoeCards.nid, echoeNotes.id))
      .leftJoin(echoeDecks, eq(echoeCards.did, echoeDecks.id))
      .leftJoin(echoeNotetypes, eq(echoeNotes.mid, echoeNotetypes.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Map to DTO
    const result: EchoeCardListItemDto[] = cards
      .map((row: any) => {
        const card = row.card;
        const note = row.note;
        const deck = row.deck;
        const notetype = row.notetype;

        if (!card) {
          logger.warn('Skip card row without base card data in getCards()', {
            rowKeys: Object.keys(row || {}),
          });
          return null;
        }

        // Get front field from fieldsJson (primary source)
        const noteFields = note ? this.parseNoteFields(note.fieldsJson as Record<string, string> | null, note.sfld) : {};
        let front = '';
        const firstFieldValue = Object.values(noteFields)[0] || '';
        front = firstFieldValue.replace(/<[^>]*>/g, '').trim();
        if (front.length > 100) {
          front = front.substring(0, 100) + '...';
        }

        return {
          id: Number(card.id),
          nid: Number(card.nid),
          did: Number(card.did),
          deckName: deck?.name || 'Unknown',
          ord: card.ord,
          type: card.type,
          queue: card.queue,
          due: card.due,
          ivl: card.ivl,
          factor: card.factor,
          reps: card.reps,
          lapses: card.lapses,
          front,
          fields: noteFields,
          tags: note ? this.parseNoteTags(note.tags) : [],
          mid: Number(note?.mid || 0),
          notetypeName: notetype?.name || 'Unknown',
          notetypeType: notetype?.type || 0,
          addedAt: Number(card.id) < 100000000000 ? Number(card.id) : Math.floor(Number(card.id) / 1000),
          mod: note?.mod || card.mod,
        };
      })
      .filter((item: EchoeCardListItemDto | null): item is EchoeCardListItemDto => item !== null);

    return { cards: result, total };
  }

  /**
   * Parse note fields, preferring fieldsJson as primary source
   */
  private parseNoteFields(fieldsJson: Record<string, string> | null | undefined, sfld: string | null): Record<string, string> {
    if (fieldsJson && typeof fieldsJson === 'object' && Object.keys(fieldsJson).length > 0) {
      return fieldsJson;
    }
    return sfld ? { Front: sfld } : {};
  }

  /**
   * Parse note tags from JSON string
   */
  private parseNoteTags(tagsJson: string | null): string[] {
    if (!tagsJson) {
      return [];
    }
    try {
      return JSON.parse(tagsJson) as string[];
    } catch {
      return [];
    }
  }

  /**
   * Restore card queues by their FSRS type for unsuspend/unbury actions.
   */
  private async restoreQueueByCardType(uid: string, cards: Array<Pick<EchoeCards, 'id' | 'type'>>, now: number, action: 'unsuspend' | 'unbury'): Promise<void> {
    const db = getDatabase();

    const knownTypeCardIds = new Map<number, number[]>();
    const unknownTypeCards: Array<Pick<EchoeCards, 'id' | 'type'>> = [];

    for (const card of cards) {
      if ([0, 1, 2, 3].includes(card.type)) {
        const ids = knownTypeCardIds.get(card.type) || [];
        ids.push(card.id);
        knownTypeCardIds.set(card.type, ids);
      } else {
        unknownTypeCards.push(card);
      }
    }

    await Promise.all(
      Array.from(knownTypeCardIds.entries()).map(([type, ids]) =>
        db
          .update(echoeCards)
          .set({ queue: type, mod: now, usn: 0 })
          .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.id, ids)))
      )
    );

    if (unknownTypeCards.length > 0) {
      logger.warn(`Fallback queue restore for unknown card type in ${action}`, {
        uid,
        cardTypes: unknownTypeCards.map((card: Pick<EchoeCards, 'id' | 'type'>) => ({ id: card.id, type: card.type })),
        fallbackQueue: 0,
      });
      await db
        .update(echoeCards)
        .set({ queue: 0, mod: now, usn: 0 })
        .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.id, unknownTypeCards.map((card: Pick<EchoeCards, 'id'>) => card.id))));
    }
  }

  /**
   * Perform bulk card operations
   */
  async bulkCardOperation(uid: string, dto: BulkCardOperationDto): Promise<{ success: boolean; affected: number }> {
    const db = getDatabase();
    const { cardIds, action, payload } = dto;

    const now = Math.floor(Date.now() / 1000);
    let affected = 0;

    switch (action) {
      case 'suspend': {
        await db
          .update(echoeCards)
          .set({ queue: -1, mod: now, usn: 0 })
          .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.id, cardIds)));
        affected = cardIds.length;
        break;
      }

      case 'unsuspend': {
        // Get all cards at once and restore queue based on card type.
        const cards = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.id, cardIds)));
        await this.restoreQueueByCardType(uid, cards, now, 'unsuspend');
        affected = cards.length;
        break;
      }

      case 'bury': {
        await db
          .update(echoeCards)
          .set({ queue: -2, mod: now, usn: 0 })
          .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.id, cardIds)));
        affected = cardIds.length;
        break;
      }

      case 'unbury': {
        // Get all cards at once and restore queue based on card type.
        const cards = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.id, cardIds)));
        await this.restoreQueueByCardType(uid, cards, now, 'unbury');
        affected = cards.length;
        break;
      }

      case 'forget': {
        // Delegate to study service to keep FSRS reset semantics consistent across entry points.
        affected = await this.echoeStudyService.forgetCards(uid, cardIds);
        break;
      }

      case 'move': {
        if (!payload?.deckId) {
          throw new Error('deckId is required for move action');
        }
        await db
          .update(echoeCards)
          .set({ did: payload.deckId, mod: now, usn: 0 })
          .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.id, cardIds)));
        affected = cardIds.length;
        break;
      }

      case 'addTag': {
        if (!payload?.tag) {
          throw new Error('tag is required for addTag action');
        }
        // Get unique note IDs from cards (batch query)
        const cards = await db.select({ nid: echoeCards.nid }).from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.id, cardIds)));
        const noteIds = Array.from(new Set(cards.map((c: Pick<EchoeCards, 'nid'>) => Number(c.nid)))) as number[];

        if (noteIds.length === 0) {
          break;
        }

        // Batch query all notes at once
        const notes = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), inArray(echoeNotes.id, noteIds)));

        // Process notes and collect updates
        for (const note of notes) {
          const tags = JSON.parse(note.tags || '[]') as string[];
          if (!tags.includes(payload.tag)) {
            tags.push(payload.tag);
            await db
              .update(echoeNotes)
              .set({ tags: JSON.stringify(tags), mod: now, usn: 0 })
              .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.id, Number(note.id))));
          }
        }
        affected = noteIds.length;
        break;
      }

      case 'removeTag': {
        if (!payload?.tag) {
          throw new Error('tag is required for removeTag action');
        }
        // Get unique note IDs from cards (batch query)
        const cards = await db.select({ nid: echoeCards.nid }).from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.id, cardIds)));
        const noteIds = Array.from(new Set(cards.map((c: Pick<EchoeCards, 'nid'>) => Number(c.nid)))) as number[];

        if (noteIds.length === 0) {
          break;
        }

        // Batch query all notes at once
        const notes = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), inArray(echoeNotes.id, noteIds)));

        // Process notes and collect updates
        for (const note of notes) {
          const tags = JSON.parse(note.tags || '[]') as string[];
          const filteredTags = tags.filter((t) => t !== payload.tag);
          await db
            .update(echoeNotes)
            .set({ tags: JSON.stringify(filteredTags), mod: now, usn: 0 })
            .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.id, Number(note.id))));
        }
        affected = noteIds.length;
        break;
      }
    }

    return { success: true, affected };
  }

  /**
   * Get all note types with field and template definitions
   * Uses batch queries to avoid N+1 problem
   */
  async getAllNoteTypes(uid: string): Promise<EchoeNoteTypeDto[]> {
    const db = getDatabase();

    const notetypes = await db.select().from(echoeNotetypes).where(eq(echoeNotetypes.uid, uid)).orderBy(echoeNotetypes.name);

    if (notetypes.length === 0) {
      return [];
    }

    // Batch query all templates in one call
    const noteTypeIds = notetypes.map((nt: Pick<EchoeNotetypes, 'id'>) => Number(nt.id));
    const allTemplates = await db
      .select()
      .from(echoeTemplates)
      .where(and(eq(echoeTemplates.uid, uid), inArray(echoeTemplates.ntid, noteTypeIds)));

    // Batch query all note counts in one call
    const noteCounts = await db
      .select({ mid: echoeNotes.mid, count: sql<number>`COUNT(*)` })
      .from(echoeNotes)
      .where(and(eq(echoeNotes.uid, uid), inArray(echoeNotes.mid, noteTypeIds)))
      .groupBy(echoeNotes.mid);

    // Create a map for quick lookup
    const templatesMap = new Map<number, typeof allTemplates>();
    const countMap = new Map<number, number>();

    for (const template of allTemplates) {
      const ntid = Number(template.ntid);
      if (!templatesMap.has(ntid)) {
        templatesMap.set(ntid, []);
      }
      templatesMap.get(ntid)!.push(template);
    }

    for (const nc of noteCounts) {
      countMap.set(Number(nc.mid), Number(nc.count));
    }

    // Build result
    const result: EchoeNoteTypeDto[] = [];

    for (const nt of notetypes) {
      const ntid = Number(nt.id);
      const templates = templatesMap.get(ntid) || [];

      result.push({
        id: ntid,
        name: nt.name,
        mod: nt.mod,
        sortf: nt.sortf,
        did: Number(nt.did),
        tmpls: templates.map((t: EchoeTemplates) => ({
          id: Number(t.id),
          name: t.name,
          ord: t.ord,
          qfmt: t.qfmt,
          afmt: t.afmt,
          bqfmt: t.bqfmt,
          bafmt: t.bafmt,
          did: Number(t.did),
        })),
        flds: JSON.parse(nt.flds),
        css: nt.css,
        type: nt.type,
        latexPre: nt.latexPre,
        latexPost: nt.latexPost,
        req: nt.req,
        noteCount: countMap.get(ntid) || 0,
      });
    }

    return result;
  }

  /**
   * Create a new note type
   * Supports cloning from an existing note type via cloneFrom parameter
   */
  async createNoteType(uid: string, dto: CreateEchoeNoteTypeDto): Promise<EchoeNoteTypeDto> {
    const db = getDatabase();

    const now = Math.floor(Date.now() / 1000);
    const noteTypeId = generateNoteTypeId();

    let fields = dto.flds;
    let templates = dto.tmpls;
    let css = dto.css;
    let latexPre = dto.latexPre;
    let latexPost = dto.latexPost;
    let noteType = 0;

    // If cloning from an existing note type
    if (dto.cloneFrom) {
      const sourceNotetype = await db.select().from(echoeNotetypes).where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, dto.cloneFrom))).limit(1);
      if (sourceNotetype.length > 0) {
        const source = sourceNotetype[0];
        fields = fields || JSON.parse(source.flds as string).map((f: any) => ({ name: f.name }));
        templates = templates || JSON.parse(source.tmpls as string).map((t: any) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt }));
        css = css || source.css;
        latexPre = latexPre || source.latexPre;
        latexPost = latexPost || source.latexPost;
        noteType = source.type;
      }
    }

    // Default fields if not provided
    fields = fields || [{ name: 'Front' }, { name: 'Back' }];
    templates = templates || [
      { name: 'Card 1', qfmt: '{{Front}}', afmt: '{{FrontSide}}\n\n<hr>\n\n{{Back}}' },
    ];

    // Build JSON fields
    const fldsJson = JSON.stringify(
      fields.map((f, i) => ({
        name: f.name,
        ord: i,
        sticky: false,
        rtl: false,
        font: 'Arial',
        size: 20,
        description: '',
        mathjax: false,
        hidden: false,
      }))
    );

    // Build JSON templates
    const tmplsJson = JSON.stringify(
      templates.map((t, i) => ({
        name: t.name,
        ord: i,
        qfmt: t.qfmt,
        afmt: t.afmt || '{{FrontSide}}\n\n<hr>\n\n{{Back}}',
        bqfmt: '',
        bafmt: '',
        did: 0,
      }))
    );

    // Default CSS
    css = css || `.card {\n  font-family: arial;\n  font-size: 20px;\n  text-align: center;\n  color: black;\n  background-color: white;\n}`;
    latexPre = latexPre || '\\documentclass[12pt]{article}\n\\special{papersize=210mm,297mm}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amsmath}\n\\usepackage{graphicx}\n\\begin{document}';
    latexPost = latexPost || '\\end{document}';

    const newNotetype = await db.insert(echoeNotetypes).values({
      id: noteTypeId,
      uid,
      name: dto.name,
      mod: now,
      usn: 0,
      sortf: 0,
      did: 0,
      tmpls: tmplsJson,
      flds: fldsJson,
      css,
      type: noteType,
      latexPre,
      latexPost,
      req: '[]',
    });

    // Create templates in database
    const createdTemplates: any[] = [];
    for (let i = 0; i < templates.length; i++) {
      const template = templates[i];
      const templateId = noteTypeId * 1000000 + i * 1000 + Math.floor(Math.random() * 1000);
      await db.insert(echoeTemplates).values({
        id: templateId,
        uid,
        ntid: noteTypeId,
        name: template.name,
        ord: i,
        qfmt: template.qfmt,
        afmt: template.afmt || '{{FrontSide}}\n\n<hr>\n\n{{Back}}',
        bqfmt: '',
        bafmt: '',
        did: 0,
        mod: now,
        usn: 0,
      });
      createdTemplates.push({
        id: templateId,
        name: template.name,
        ord: i,
        qfmt: template.qfmt,
        afmt: template.afmt || '{{FrontSide}}\n\n<hr>\n\n{{Back}}',
        bqfmt: '',
        bafmt: '',
        did: 0,
      });
    }

    return {
      id: noteTypeId,
      name: dto.name,
      mod: now,
      sortf: 0,
      did: 0,
      tmpls: createdTemplates,
      flds: JSON.parse(fldsJson),
      css,
      type: noteType,
      latexPre,
      latexPost,
      req: '[]',
    };
  }

  /**
   * Update a note type
   */
  async updateNoteType(uid: string, id: number, dto: UpdateEchoeNoteTypeDto): Promise<EchoeNoteTypeDto | null> {
    const db = getDatabase();

    const notetype = await db.select().from(echoeNotetypes).where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, id))).limit(1);

    if (notetype.length === 0) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const updates: any = { mod: now, usn: 0 };

    if (dto.name !== undefined) {
      updates.name = dto.name;
    }

    if (dto.css !== undefined) {
      updates.css = dto.css;
    }

    if (dto.latexPre !== undefined) {
      updates.latexPre = dto.latexPre;
    }

    if (dto.latexPost !== undefined) {
      updates.latexPost = dto.latexPost;
    }

    await db.update(echoeNotetypes).set(updates).where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, id)));

    // Add new fields if provided
    if (dto.flds) {
      const existingFields = JSON.parse(notetype[0].flds) as any[];
      const newOrd = existingFields.length;

      for (let i = 0; i < dto.flds.length; i++) {
        const f = dto.flds[i];
        const newFields = [
          ...existingFields,
          {
            name: f.name,
            ord: newOrd + i,
            sticky: false,
            rtl: false,
            font: 'Arial',
            size: 20,
            description: '',
            mathjax: false,
            hidden: false,
          },
        ];
        await db.update(echoeNotetypes).set({ flds: JSON.stringify(newFields) }).where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, id)));
      }
    }

    // Add new templates if provided
    if (dto.tmpls) {
      const existingTemplates = JSON.parse(notetype[0].tmpls) as any[];
      const newOrd = existingTemplates.length;

      for (let i = 0; i < dto.tmpls.length; i++) {
        const t = dto.tmpls[i];
        const templateId = id * 1000000 + (newOrd + i) * 1000 + Math.floor(Math.random() * 1000);
        await db.insert(echoeTemplates).values({
          id: templateId,
          uid,
          ntid: id,
          name: t.name,
          ord: newOrd + i,
          qfmt: t.qfmt,
          afmt: t.afmt || '{{FrontSide}}\n\n<hr>\n\n{{Back}}',
          bqfmt: '',
          bafmt: '',
          did: 0,
          mod: now,
          usn: 0,
        });
      }
    }

    // Return updated note type
    return this.getNoteTypeById(uid, id);
  }

  /**
   * Delete a note type (rejects if notes exist)
   */
  async deleteNoteType(uid: string, id: number): Promise<{ success: boolean; message?: string }> {
    const db = getDatabase();

    const notetype = await db.select().from(echoeNotetypes).where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, id))).limit(1);

    if (notetype.length === 0) {
      return { success: false, message: 'Note type not found' };
    }

    // Check if any notes use this type
    const notes = await db.select({ count: sql<number>`COUNT(*)` }).from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.mid, id)));
    const noteCount = Number(notes[0]?.count || 0);

    if (noteCount > 0) {
      return { success: false, message: `Cannot delete note type: ${noteCount} notes exist using this type` };
    }

    // Delete templates first
    await db.delete(echoeTemplates).where(and(eq(echoeTemplates.uid, uid), eq(echoeTemplates.ntid, id)));

    // Delete note type
    await db.delete(echoeNotetypes).where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, id)));

    return { success: true };
  }

  /**
   * Get note type by ID
   */
  async getNoteTypeById(uid: string, id: number): Promise<EchoeNoteTypeDto | null> {
    const db = getDatabase();

    const notetype = await db.select().from(echoeNotetypes).where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.id, id))).limit(1);

    if (notetype.length === 0) {
      return null;
    }

    const templates = await db.select().from(echoeTemplates).where(and(eq(echoeTemplates.uid, uid), eq(echoeTemplates.ntid, id)));

    // Get note count for this note type
    const noteCountResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(echoeNotes)
      .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.mid, id)));
    const noteCount = Number(noteCountResult[0]?.count || 0);

    return {
      id: Number(notetype[0].id),
      name: notetype[0].name,
      mod: notetype[0].mod,
      sortf: notetype[0].sortf,
      did: Number(notetype[0].did),
      tmpls: templates.map((t: EchoeTemplates) => ({
        id: Number(t.id),
        name: t.name,
        ord: t.ord,
        qfmt: t.qfmt,
        afmt: t.afmt,
        bqfmt: t.bqfmt,
        bafmt: t.bafmt,
        did: Number(t.did),
      })),
      flds: JSON.parse(notetype[0].flds),
      css: notetype[0].css,
      type: notetype[0].type,
      latexPre: notetype[0].latexPre,
      latexPost: notetype[0].latexPost,
      req: notetype[0].req,
      noteCount,
    };
  }

  /**
   * Get deck and all sub-deck IDs
   */
  private async getDeckAndSubdeckIds(uid: string, id: number): Promise<number[]> {
    const db = getDatabase();

    const deck = await db
      .select({ name: echoeDecks.name })
      .from(echoeDecks)
      .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.id, id)))
      .limit(1);

    if (deck.length === 0) {
      return [];
    }

    const result: number[] = [id];
    const subDecks = await db
      .select({ id: echoeDecks.id })
      .from(echoeDecks)
      .where(and(eq(echoeDecks.uid, uid), like(echoeDecks.name, `${deck[0].name}::%`)));

    for (const subDeck of subDecks) {
      result.push(Number(subDeck.id));
    }

    return result;
  }

  /**
   * Safely parse JSON with fallback
   */
  private safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
    if (!json) return fallback;
    try {
      return JSON.parse(json) as T;
    } catch (error) {
      logger.error('Failed to parse JSON', { error });
      return fallback;
    }
  }

  /**
   * Map database note to DTO
   */
  private mapNoteToDto(note: any): EchoeNoteDto {
    // Prefer fieldsJson (primary structured storage) over legacy flds split
    const fields: Record<string, string> =
      note.fieldsJson && typeof note.fieldsJson === 'object' && Object.keys(note.fieldsJson).length > 0
        ? (note.fieldsJson as Record<string, string>)
        : {};

    return {
      id: Number(note.id),
      guid: note.guid,
      mid: Number(note.mid),
      mod: note.mod,
      tags: this.safeJsonParse<string[]>(note.tags, []),
      fields,
      sfld: note.sfld,
      csum: Number(note.csum),
      flags: note.flags,
      data: note.data,
      richTextFields: note.richTextFields ?? undefined,
    };
  }

  /**
   * Map database card to DTO
   */
  private mapCardToDto(card: any): EchoeCardDto {
    return {
      id: Number(card.id),
      nid: Number(card.nid),
      did: Number(card.did),
      ord: card.ord,
      mod: card.mod,
      type: card.type,
      queue: card.queue,
      due: Number(card.due),
      ivl: card.ivl,
      factor: card.factor,
      reps: card.reps,
      lapses: card.lapses,
      left: card.left,
      usn: card.usn,
      stability: card.stability ?? 0,
      difficulty: card.difficulty ?? 0,
      lastReview: card.lastReview ?? 0,
    };
  }

  /**
   * Generate a random 40-character hex GUID
   */
  private generateGuid(): string {
    const chars = '0123456789abcdef';
    let guid = '';
    for (let i = 0; i < 40; i++) {
      guid += chars[Math.floor(Math.random() * chars.length)];
    }
    return guid;
  }

}
