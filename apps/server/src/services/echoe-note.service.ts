import { Service } from 'typedi';
import { eq, and, inArray, like, sql, or, desc, asc } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { echoeTemplates } from '../db/schema/echoe-templates.js';
import { echoeGraves } from '../db/schema/echoe-graves.js';
import { echoeRevlog } from '../db/schema/echoe-revlog.js';
import { logger } from '../utils/logger.js';
import { safeJsonParse, parseNoteFields, parseTags } from '../utils/echoe-note.utils.js';
import { EchoeStudyService } from './echoe-study.service.js';
import { EchoeDeckService } from './echoe-deck.service.js';
import { normalizeNoteFields } from '../lib/note-field-normalizer.js';
import { generateTypeId } from '../utils/id.js';
import { OBJECT_TYPE } from '../models/constant/type.js';
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
  constructor(
    private echoeStudyService: EchoeStudyService,
    private echoeDeckService: EchoeDeckService,
  ) {}

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
      const deckIds = await this.echoeDeckService.getDeckAndSubdeckIds(uid, deckId);

      // Get cards in these decks
      const cards = await db
        .select({ nid: echoeCards.nid })
        .from(echoeCards)
        .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.did, deckIds)));

      const noteIds: string[] = Array.from(new Set(cards.map((c: Pick<EchoeCards, 'nid'>) => c.nid)));
      if (noteIds.length > 0) {
        conditions.push(inArray(echoeNotes.noteId, noteIds));
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
        const noteIds: string[] = Array.from(new Set(cards.map((c: Pick<EchoeCards, 'nid'>) => c.nid)));
        if (noteIds.length > 0) {
          conditions.push(inArray(echoeNotes.noteId, noteIds));
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
  async getNoteById(uid: string, id: string): Promise<EchoeNoteWithCardsDto | null> {
    const db = getDatabase();

    const note = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, id))).limit(1);

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
    const notetype = await db
      .select()
      .from(echoeNotetypes)
      .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, dto.notetypeId), eq(echoeNotetypes.deletedAt, 0)))
      .limit(1);

    if (notetype.length === 0) {
      throw new Error(`Invalid relation: Note type '${dto.notetypeId}' not found for field 'mid' (notetypeId)`);
    }

    // Validate deck ownership (outside transaction - read only)
    const deck = await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, dto.deckId))).limit(1);

    if (deck.length === 0) {
      throw new Error(`Invalid relation: Deck '${dto.deckId}' not found for field 'did' (deckId)`);
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
    const noteId = generateTypeId(OBJECT_TYPE.ECHOE_NOTE);

    // Wrap note and card creation in a transaction
    return withTransaction(async (tx) => {
      // MySQL insert does not support returning(); fetch the inserted note explicitly.
      await tx.insert(echoeNotes).values({
        noteId,
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
        const cardId = generateTypeId(OBJECT_TYPE.ECHOE_CARD);
        await tx.insert(echoeCards).values({
          cardId,
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
          // Semantic business ID fields (preferred)
          cardId,
          noteId,
          deckId: dto.deckId,
          // @deprecated aliases - retained for backwards compatibility
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

      const insertedNote = await tx.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, noteId))).limit(1);

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
  async updateNote(uid: string, id: string, dto: UpdateEchoeNoteDto): Promise<EchoeNoteDto | null> {
    const db = getDatabase();

    const note = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, id))).limit(1);

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
        .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, note[0].mid), eq(echoeNotetypes.deletedAt, 0)))
        .limit(1);

      if (notetype.length === 0) {
        throw new Error(`Invalid relation: Note type '${note[0].mid}' not found for field 'mid' (notetypeId)`);
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

    await db.update(echoeNotes).set(updates).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, id)));

    const updated = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, id))).limit(1);
    return this.mapNoteToDto(updated[0]);
  }

  /**
   * Delete a note
   */
  async deleteNote(uid: string, id: string): Promise<boolean> {
    const db = getDatabase();

    const note = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, id))).limit(1);

    if (note.length === 0) {
      return false;
    }

    // Get cards for this note (read before transaction to avoid holding read locks longer than necessary)
    const cards = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), eq(echoeCards.nid, id)));

    const now = Date.now(); // Millisecond timestamp for soft delete

    // Wrap all mutation operations in a transaction to prevent partial-delete state
    // Cascade: note -> cards -> revlogs (FR-3)
    return withTransaction(async (tx) => {
      // Soft delete revlogs for all cards (cascade from cards)
      if (cards.length > 0) {
        const cardIds = cards.map((c: EchoeCards) => c.cardId);
        await tx.update(echoeRevlog)
          .set({ deletedAt: now })
          .where(and(eq(echoeRevlog.uid, uid), eq(echoeRevlog.deletedAt, 0), inArray(echoeRevlog.cid, cardIds)));
      }

      // Add cards to graves
      for (const card of cards) {
        await tx.insert(echoeGraves).values({ graveId: generateTypeId(OBJECT_TYPE.ECHOE_GRAVE), uid, usn: 0, oid: card.cardId, type: 2 });
      }

      // Add note to graves
      await tx.insert(echoeGraves).values({ graveId: generateTypeId(OBJECT_TYPE.ECHOE_GRAVE), uid, usn: 0, oid: id, type: 1 });

      // Soft delete cards
      await tx.update(echoeCards)
        .set({ deletedAt: now })
        .where(and(eq(echoeCards.uid, uid), eq(echoeCards.deletedAt, 0), eq(echoeCards.nid, id)));

      // Soft delete note
      await tx.update(echoeNotes)
        .set({ deletedAt: now })
        .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.deletedAt, 0), eq(echoeNotes.noteId, id)));

      return true;
    });
  }

  /**
   * Get card by ID with full note data
   */
  async getCardById(uid: string, id: string): Promise<EchoeCardWithNoteDto | null> {
    const db = getDatabase();

    const card = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), eq(echoeCards.cardId, id))).limit(1);

    if (card.length === 0) {
      return null;
    }

    const note = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, card[0].nid))).limit(1);

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
      const deckIds = await this.echoeDeckService.getDeckAndSubdeckIds(uid, deckId);
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
            .select({ noteId: echoeNotes.noteId })
            .from(echoeNotes)
            .where(and(eq(echoeNotes.uid, uid), sql`${echoeNotes.tags} LIKE '%"leech"%'`));

          const leechNoteIds = leechNotes.map((n: Pick<EchoeNotes, 'noteId'>) => n.noteId);
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
      .leftJoin(echoeNotes, eq(echoeCards.nid, echoeNotes.noteId))
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
      .leftJoin(echoeNotes, eq(echoeCards.nid, echoeNotes.noteId))
      .leftJoin(echoeDecks, and(eq(echoeCards.did, echoeDecks.deckId), eq(echoeDecks.uid, uid)))
      .leftJoin(echoeNotetypes, and(eq(echoeNotes.mid, echoeNotetypes.noteTypeId), eq(echoeNotetypes.uid, uid)))
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
        const noteFields = note ? parseNoteFields(note.fieldsJson as Record<string, string> | null, note.sfld) : {};
        let front = '';
        const firstFieldValue = Object.values(noteFields)[0] || '';
        front = firstFieldValue.replace(/<[^>]*>/g, '').trim();
        if (front.length > 100) {
          front = front.substring(0, 100) + '...';
        }

        return {
          // Semantic business ID fields (preferred)
          cardId: card.cardId,
          noteId: card.nid,
          deckId: card.did,
          // @deprecated aliases - retained for backwards compatibility
          id: card.cardId,
          nid: card.nid,
          did: card.did,
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
          tags: note ? parseTags(note.tags) : [],
          mid: note?.mid || '',
          notetypeName: notetype?.name || 'Unknown',
          notetypeType: notetype?.type || 0,
          addedAt: card.mod * 1000,
          mod: note?.mod || card.mod,
        };
      })
      .filter((item: EchoeCardListItemDto | null): item is EchoeCardListItemDto => item !== null);

    return { cards: result, total };
  }

  /**
   * Restore card queues by their FSRS type for unsuspend/unbury actions.
   */
  private async restoreQueueByCardType(uid: string, cards: Array<Pick<EchoeCards, 'cardId' | 'type'>>, now: number, action: 'unsuspend' | 'unbury'): Promise<void> {
    const db = getDatabase();

    const knownTypeCardIds = new Map<number, string[]>();
    const unknownTypeCards: Array<Pick<EchoeCards, 'cardId' | 'type'>> = [];

    for (const card of cards) {
      if ([0, 1, 2, 3].includes(card.type)) {
        const ids = knownTypeCardIds.get(card.type) || [];
        ids.push(card.cardId);
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
          .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.cardId, ids)))
      )
    );

    if (unknownTypeCards.length > 0) {
      logger.warn(`Fallback queue restore for unknown card type in ${action}`, {
        uid,
        cardTypes: unknownTypeCards.map((card: Pick<EchoeCards, 'cardId' | 'type'>) => ({ id: card.cardId, type: card.type })),
        fallbackQueue: 0,
      });
      await db
        .update(echoeCards)
        .set({ queue: 0, mod: now, usn: 0 })
        .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.cardId, unknownTypeCards.map((card: Pick<EchoeCards, 'cardId'>) => card.cardId))));
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
          .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.cardId, cardIds)));
        affected = cardIds.length;
        break;
      }

      case 'unsuspend': {
        // Get all cards at once and restore queue based on card type.
        const cards = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.cardId, cardIds)));
        await this.restoreQueueByCardType(uid, cards, now, 'unsuspend');
        affected = cards.length;
        break;
      }

      case 'bury': {
        await db
          .update(echoeCards)
          .set({ queue: -2, mod: now, usn: 0 })
          .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.cardId, cardIds)));
        affected = cardIds.length;
        break;
      }

      case 'unbury': {
        // Get all cards at once and restore queue based on card type.
        const cards = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.cardId, cardIds)));
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
        // Security: verify the target deck belongs to the current user to prevent cross-tenant card movement.
        const targetDeck = await db
          .select({ deckId: echoeDecks.deckId })
          .from(echoeDecks)
          .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, payload.deckId)))
          .limit(1);
        if (targetDeck.length === 0) {
          logger.warn('bulkCardOperation move: target deckId does not belong to uid', {
            uid,
            deckId: payload.deckId,
          });
          throw new Error('FORBIDDEN: target deck does not belong to the current user');
        }
        await db
          .update(echoeCards)
          .set({ did: payload.deckId, mod: now, usn: 0 })
          .where(and(eq(echoeCards.uid, uid), inArray(echoeCards.cardId, cardIds)));
        affected = cardIds.length;
        break;
      }

      case 'addTag': {
        if (!payload?.tag) {
          throw new Error('tag is required for addTag action');
        }
        // Get unique note IDs from cards (batch query)
        const cards = await db.select({ nid: echoeCards.nid }).from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.cardId, cardIds)));
        const noteIds: string[] = Array.from(new Set(cards.map((c: Pick<EchoeCards, 'nid'>) => c.nid)));

        if (noteIds.length === 0) {
          break;
        }

        // Batch query all notes at once
        const notes = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), inArray(echoeNotes.noteId, noteIds)));

        // Process notes and collect updates
        for (const note of notes) {
          const tags = JSON.parse(note.tags || '[]') as string[];
          if (!tags.includes(payload.tag)) {
            tags.push(payload.tag);
            await db
              .update(echoeNotes)
              .set({ tags: JSON.stringify(tags), mod: now, usn: 0 })
              .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, note.noteId)));
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
        const cards = await db.select({ nid: echoeCards.nid }).from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.cardId, cardIds)));
        const noteIds: string[] = Array.from(new Set(cards.map((c: Pick<EchoeCards, 'nid'>) => c.nid)));

        if (noteIds.length === 0) {
          break;
        }

        // Batch query all notes at once
        const notes = await db.select().from(echoeNotes).where(and(eq(echoeNotes.uid, uid), inArray(echoeNotes.noteId, noteIds)));

        // Process notes and collect updates
        for (const note of notes) {
          const tags = JSON.parse(note.tags || '[]') as string[];
          const filteredTags = tags.filter((t) => t !== payload.tag);
          await db
            .update(echoeNotes)
            .set({ tags: JSON.stringify(filteredTags), mod: now, usn: 0 })
            .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, note.noteId)));
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

    const notetypes = await db
      .select()
      .from(echoeNotetypes)
      .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.deletedAt, 0)))
      .orderBy(echoeNotetypes.name);

    if (notetypes.length === 0) {
      return [];
    }

    // Batch query all templates in one call
    const noteTypeIds = notetypes.map((nt: Pick<EchoeNotetypes, 'noteTypeId'>) => nt.noteTypeId);
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
    const templatesMap = new Map<string, typeof allTemplates>();
    const countMap = new Map<string, number>();

    for (const template of allTemplates) {
      const ntid = template.ntid;
      if (!templatesMap.has(ntid)) {
        templatesMap.set(ntid, []);
      }
      templatesMap.get(ntid)!.push(template);
    }

    for (const nc of noteCounts) {
      countMap.set(nc.mid, Number(nc.count));
    }

    // Build result
    const result: EchoeNoteTypeDto[] = [];

    for (const nt of notetypes) {
      const ntid = nt.noteTypeId;
      const templates = templatesMap.get(ntid) || [];

      result.push({
        id: ntid,
        name: nt.name,
        mod: nt.mod,
        sortf: nt.sortf,
        did: nt.did,
        tmpls: templates.map((t: EchoeTemplates) => ({
          id: t.templateId,
          name: t.name,
          ord: t.ord,
          qfmt: t.qfmt,
          afmt: t.afmt,
          bqfmt: t.bqfmt,
          bafmt: t.bafmt,
          did: t.did,
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
    const noteTypeId = generateTypeId(OBJECT_TYPE.ECHOE_NOTETYPE);

    let fields = dto.flds;
    let templates = dto.tmpls;
    let css = dto.css;
    let latexPre = dto.latexPre;
    let latexPost = dto.latexPost;
    let noteType = 0;

    // If cloning from an existing note type
    if (dto.cloneFrom) {
      const sourceNotetype = await db
        .select()
        .from(echoeNotetypes)
        .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, dto.cloneFrom), eq(echoeNotetypes.deletedAt, 0)))
        .limit(1);
      if (sourceNotetype.length === 0) {
        throw new Error(`Invalid relation: Note type '${dto.cloneFrom}' not found for field 'cloneFrom' (source notetype)`);
      }
      const source = sourceNotetype[0];
      fields = fields || JSON.parse(source.flds as string).map((f: any) => ({ name: f.name }));
      templates = templates || JSON.parse(source.tmpls as string).map((t: any) => ({ name: t.name, qfmt: t.qfmt, afmt: t.afmt }));
      css = css || source.css;
      latexPre = latexPre || source.latexPre;
      latexPost = latexPost || source.latexPost;
      noteType = source.type;
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
      noteTypeId,
      uid,
      name: dto.name,
      mod: now,
      usn: 0,
      sortf: 0,
      did: '',
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
      const templateId = generateTypeId(OBJECT_TYPE.ECHOE_TEMPLATE);
      await db.insert(echoeTemplates).values({
        templateId,
        uid,
        ntid: noteTypeId,
        name: template.name,
        ord: i,
        qfmt: template.qfmt,
        afmt: template.afmt || '{{FrontSide}}\n\n<hr>\n\n{{Back}}',
        bqfmt: '',
        bafmt: '',
        did: '',
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
        did: '',
      });
    }

    return {
      id: noteTypeId,
      name: dto.name,
      mod: now,
      sortf: 0,
      did: '',
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
  async updateNoteType(uid: string, id: string, dto: UpdateEchoeNoteTypeDto): Promise<EchoeNoteTypeDto | null> {
    const db = getDatabase();

    const notetype = await db
      .select()
      .from(echoeNotetypes)
      .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, id), eq(echoeNotetypes.deletedAt, 0)))
      .limit(1);

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

    await db.update(echoeNotetypes).set(updates).where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, id)));

    // Add new fields if provided
    if (dto.flds) {
      const existingFields = JSON.parse(notetype[0].flds) as any[];
      const newOrd = existingFields.length;
      const newFields = [...existingFields];

      for (let i = 0; i < dto.flds.length; i++) {
        const f = dto.flds[i];
        newFields.push({
          name: f.name,
          ord: newOrd + i,
          sticky: false,
          rtl: false,
          font: 'Arial',
          size: 20,
          description: '',
          mathjax: false,
          hidden: false,
        });
      }
      await db.update(echoeNotetypes).set({ flds: JSON.stringify(newFields) }).where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, id)));
    }

    // Add new templates if provided
    if (dto.tmpls) {
      const existingTemplates = JSON.parse(notetype[0].tmpls) as any[];
      const newOrd = existingTemplates.length;

      for (let i = 0; i < dto.tmpls.length; i++) {
        const t = dto.tmpls[i];
        const templateId = generateTypeId(OBJECT_TYPE.ECHOE_TEMPLATE);
        await db.insert(echoeTemplates).values({
          templateId,
          uid,
          ntid: id,
          name: t.name,
          ord: newOrd + i,
          qfmt: t.qfmt,
          afmt: t.afmt || '{{FrontSide}}\n\n<hr>\n\n{{Back}}',
          bqfmt: '',
          bafmt: '',
          did: '',
          mod: now,
          usn: 0,
        });
      }
    }

    // Rename fields in notetype flds and migrate existing notes' fieldsJson
    if (dto.fldRenames && dto.fldRenames.length > 0) {
      // Build a deduplicated rename map (from → to), skip no-ops
      const renameMap = new Map<string, string>();
      for (const r of dto.fldRenames) {
        if (r.from && r.to && r.from !== r.to) {
          renameMap.set(r.from, r.to);
        }
      }

      if (renameMap.size > 0) {
        // 1. Update field names in the notetype's flds JSON array
        const currentFlds = JSON.parse(notetype[0].flds) as any[];
        const updatedFlds = currentFlds.map((f: any) => {
          const newName = renameMap.get(f.name);
          return newName !== undefined ? { ...f, name: newName } : f;
        });
        await db
          .update(echoeNotetypes)
          .set({ flds: JSON.stringify(updatedFlds) })
          .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, id)));

        logger.info('Renamed fields in notetype flds', {
          uid,
          notetypeId: id,
          renames: Object.fromEntries(renameMap),
        });

        // 2. Migrate fieldsJson in all notes belonging to this notetype
        const affectedNotes = await db
          .select({ noteId: echoeNotes.noteId, fieldsJson: echoeNotes.fieldsJson })
          .from(echoeNotes)
          .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.mid, id)));

        if (affectedNotes.length > 0) {
          for (const note of affectedNotes) {
            const oldFields = (note.fieldsJson ?? {}) as Record<string, string>;
            const newFields: Record<string, string> = {};
            for (const [key, value] of Object.entries(oldFields)) {
              const newKey = renameMap.get(key) ?? key;
              newFields[newKey] = value;
            }
            await db
              .update(echoeNotes)
              .set({ fieldsJson: newFields, mod: now })
              .where(and(eq(echoeNotes.uid, uid), eq(echoeNotes.noteId, note.noteId)));
          }

          logger.info('Migrated fieldsJson for renamed fields', {
            uid,
            notetypeId: id,
            affectedNotes: affectedNotes.length,
            renames: Object.fromEntries(renameMap),
          });
        }
      }
    }

    // Return updated note type
    return this.getNoteTypeById(uid, id);
  }

  /**
   * Delete a note type (soft delete - archives instead of deleting)
   * Sets decks.mid = null for associated decks as per FR-3
   * Preserves all notes, cards, revlogs, and templates (no cascade delete)
   */
  async deleteNoteType(uid: string, id: string): Promise<{ success: boolean; message?: string }> {
    const db = getDatabase();

    // Check if notetype exists and is not already deleted
    const notetype = await db
      .select()
      .from(echoeNotetypes)
      .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, id), eq(echoeNotetypes.deletedAt, 0)))
      .limit(1);

    if (notetype.length === 0) {
      return { success: false, message: 'Note type not found or already deleted' };
    }

    // Use transaction for atomicity
    return withTransaction(async (tx) => {
      const now = Date.now();

      // 1. Mark notetype as deleted (soft delete)
      await tx
        .update(echoeNotetypes)
        .set({ deletedAt: now })
        .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, id)));

      // 2. Set decks.mid = null for associated decks (as per FR-3)
      await tx
        .update(echoeDecks)
        .set({ mid: null })
        .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.mid, id)));

      return { success: true };
    });
  }

  /**
   * Get note type by ID
   */
  async getNoteTypeById(uid: string, id: string): Promise<EchoeNoteTypeDto | null> {
    const db = getDatabase();

    const notetype = await db
      .select()
      .from(echoeNotetypes)
      .where(and(eq(echoeNotetypes.uid, uid), eq(echoeNotetypes.noteTypeId, id), eq(echoeNotetypes.deletedAt, 0)))
      .limit(1);

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
      id: notetype[0].noteTypeId,
      name: notetype[0].name,
      mod: notetype[0].mod,
      sortf: notetype[0].sortf,
      did: notetype[0].did,
      tmpls: templates.map((t: EchoeTemplates) => ({
        id: t.templateId,
        name: t.name,
        ord: t.ord,
        qfmt: t.qfmt,
        afmt: t.afmt,
        bqfmt: t.bqfmt,
        bafmt: t.bafmt,
        did: t.did,
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
   * Map database note to DTO
   */
  private mapNoteToDto(note: any): EchoeNoteDto {
    // Prefer fieldsJson (primary structured storage) over legacy flds split
    const fields: Record<string, string> =
      note.fieldsJson && typeof note.fieldsJson === 'object' && Object.keys(note.fieldsJson).length > 0
        ? (note.fieldsJson as Record<string, string>)
        : {};

    return {
      // Semantic business ID fields (preferred)
      noteId: note.noteId,
      // @deprecated alias - retained for backwards compatibility
      id: note.noteId,
      guid: note.guid,
      mid: note.mid,
      mod: note.mod,
      tags: safeJsonParse<string[]>(note.tags, []),
      fields,
      sfld: note.sfld,
      csum: String(note.csum),
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
      // Semantic business ID fields (preferred)
      cardId: card.cardId,
      noteId: card.nid,
      deckId: card.did,
      // @deprecated aliases - retained for backwards compatibility
      id: card.cardId,
      nid: card.nid,
      did: card.did,
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
