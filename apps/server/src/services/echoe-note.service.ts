import { Service } from 'typedi';
import { eq, and, inArray, like, sql, or, desc, asc } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { echoeTemplates } from '../db/schema/echoe-templates.js';
import { echoeGraves } from '../db/schema/echoe-graves.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { echoeRevlog } from '../db/schema/echoe-revlog.js';
import { logger } from '../utils/logger.js';

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
  /**
   * Get notes with optional filters
   */
  async getNotes(params: EchoeNoteQueryParams): Promise<{ notes: EchoeNoteDto[]; total: number }> {
    const db = getDatabase();
    const { deckId, tags, q, status, page = 1, limit = 20 } = params;

    const conditions: any[] = [];

    // Filter by deck - find cards in deck, then get notes
    if (deckId !== undefined) {
      // Get all sub-deck IDs
      const deckIds = await this.getDeckAndSubdeckIds(deckId);

      // Get cards in these decks
      const cards = await db
        .select({ nid: echoeCards.nid })
        .from(echoeCards)
        .where(inArray(echoeCards.did, deckIds));

      const noteIds = Array.from(new Set(cards.map((c) => Number(c.nid)))) as number[];
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
      const today = Math.floor(Date.now() / 86400000);
      let cardConditions: any;

      switch (status) {
        case 'new':
          cardConditions = eq(echoeCards.queue, 0);
          break;
        case 'learn':
          cardConditions = sql`${echoeCards.queue} IN (1, 3)`;
          break;
        case 'review':
          cardConditions = and(eq(echoeCards.queue, 2), sql`${echoeCards.due} <= ${today}`);
          break;
        case 'suspended':
          cardConditions = eq(echoeCards.queue, -1);
          break;
        case 'buried':
          cardConditions = sql`${echoeCards.queue} IN (-2, -3)`;
          break;
      }

      if (cardConditions) {
        const cards = await db.select({ nid: echoeCards.nid }).from(echoeCards).where(cardConditions);
        const noteIds = Array.from(new Set(cards.map((c) => Number(c.nid)))) as number[];
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
      notes: notes.map((n) => this.mapNoteToDto(n)),
      total,
    };
  }

  /**
   * Get a single note by ID
   */
  async getNoteById(id: number): Promise<EchoeNoteWithCardsDto | null> {
    const db = getDatabase();

    const note = await db.select().from(echoeNotes).where(eq(echoeNotes.id, id)).limit(1);

    if (note.length === 0) {
      return null;
    }

    // Get cards for this note
    const cards = await db.select().from(echoeCards).where(eq(echoeCards.nid, id));

    return {
      ...this.mapNoteToDto(note[0]),
      cards: cards.map((c) => this.mapCardToDto(c)),
    };
  }

  /**
   * Create a new note
   */
  async createNote(dto: CreateEchoeNoteDto): Promise<EchoeNoteWithCardsDto> {
    const db = getDatabase();

    // Get note type to determine templates
    const notetype = await db.select().from(echoeNotetypes).where(eq(echoeNotetypes.id, dto.notetypeId)).limit(1);

    if (notetype.length === 0) {
      throw new Error(`Note type ${dto.notetypeId} not found`);
    }

    // Parse templates
    const templates = JSON.parse(notetype[0].tmpls) as Array<{ ord: number; name: string }>;

    // Generate GUID (40 char hex string)
    const guid = this.generateGuid();

    // Generate sort field from first field
    const firstFieldKey = Object.keys(dto.fields)[0];
    const sfld = this.cleanSortField(dto.fields[firstFieldKey] || '');

    // Calculate checksum
    const csum = this.calculateChecksum(sfld);

    // Build tags JSON
    const tags = dto.tags || [];
    const tagsJson = JSON.stringify(tags);

    // Join fields with \x1f
    const flds = Object.values(dto.fields).join('\x1f');

    const now = Math.floor(Date.now() / 1000);
    const noteId = Date.now();

    // Create note
    const newNote = await db
      .insert(echoeNotes)
      .values({
        id: noteId,
        guid,
        mid: dto.notetypeId,
        mod: now,
        usn: 0,
        tags: tagsJson,
        flds,
        sfld,
        csum,
        flags: 0,
        data: '[]',
      })
      .returning();

    // Create cards for each template
    const createdCards: EchoeCardDto[] = [];

    for (const template of templates) {
      const cardId = Date.now() * 1000 + template.ord;
      await db.insert(echoeCards).values({
        id: cardId,
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
      });
    }

    return {
      ...this.mapNoteToDto(newNote[0]),
      cards: createdCards,
    };
  }

  /**
   * Update a note
   */
  async updateNote(id: number, dto: UpdateEchoeNoteDto): Promise<EchoeNoteDto | null> {
    const db = getDatabase();

    const note = await db.select().from(echoeNotes).where(eq(echoeNotes.id, id)).limit(1);

    if (note.length === 0) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const updates: any = { mod: now, usn: 0 };

    if (dto.fields !== undefined) {
      const flds = Object.values(dto.fields).join('\x1f');
      updates.flds = flds;

      // Update sort field from first field
      const firstFieldKey = Object.keys(dto.fields)[0];
      updates.sfld = this.cleanSortField(dto.fields[firstFieldKey] || '');

      // Recalculate checksum
      updates.csum = this.calculateChecksum(updates.sfld);
    }

    if (dto.tags !== undefined) {
      updates.tags = JSON.stringify(dto.tags);
    }

    await db.update(echoeNotes).set(updates).where(eq(echoeNotes.id, id));

    const updated = await db.select().from(echoeNotes).where(eq(echoeNotes.id, id)).limit(1);
    return this.mapNoteToDto(updated[0]);
  }

  /**
   * Delete a note
   */
  async deleteNote(id: number): Promise<boolean> {
    const db = getDatabase();

    const note = await db.select().from(echoeNotes).where(eq(echoeNotes.id, id)).limit(1);

    if (note.length === 0) {
      return false;
    }

    // Get cards for this note
    const cards = await db.select().from(echoeCards).where(eq(echoeCards.nid, id));

    const now = Math.floor(Date.now() / 1000);

    // Add cards to graves
    for (const card of cards) {
      await db.insert(echoeGraves).values({ usn: 0, oid: Number(card.id), type: 2 });
    }

    // Add note to graves
    await db.insert(echoeGraves).values({ usn: 0, oid: id, type: 1 });

    // Delete cards
    await db.delete(echoeCards).where(eq(echoeCards.nid, id));

    // Delete note
    await db.delete(echoeNotes).where(eq(echoeNotes.id, id));

    return true;
  }

  /**
   * Get card by ID with full note data
   */
  async getCardById(id: number): Promise<EchoeCardWithNoteDto | null> {
    const db = getDatabase();

    const card = await db.select().from(echoeCards).where(eq(echoeCards.id, id)).limit(1);

    if (card.length === 0) {
      return null;
    }

    const note = await db.select().from(echoeNotes).where(eq(echoeNotes.id, card[0].nid)).limit(1);

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
  async getCards(params: EchoeCardQueryParams): Promise<{ cards: EchoeCardListItemDto[]; total: number }> {
    const db = getDatabase();
    const { deckId, q, status, tag, sort = 'added', order = 'desc', page = 1, limit = 50 } = params;

    // Build card conditions
    let cardConditions: any[] = [];

    // Filter by deck
    if (deckId !== undefined) {
      const deckIds = await this.getDeckAndSubdeckIds(deckId);
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
            .where(sql`${echoeNotes.tags} LIKE '%"leech"%'`);

          const leechNoteIds = leechNotes.map((n) => n.id);
          if (leechNoteIds.length > 0) {
            cardConditions.push(inArray(echoeCards.nid, leechNoteIds));
          } else {
            return { cards: [], total: 0 };
          }
          break;
      }
    }

    // Build note conditions
    let noteConditions: any[] = [];

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
      .select()
      .from(echoeCards)
      .leftJoin(echoeNotes, eq(echoeCards.nid, echoeNotes.id))
      .leftJoin(echoeDecks, eq(echoeCards.did, echoeDecks.id))
      .leftJoin(echoeNotetypes, eq(echoeNotes.mid, echoeNotetypes.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Map to DTO
    const result: EchoeCardListItemDto[] = cards.map((row) => {
      const card = row.echoeCards;
      const note = row.echoeNotes;
      const deck = row.echoeDecks;
      const notetype = row.echoeNotetypes;

      // Get front field (first field from fields JSON)
      let front = '';
      if (note?.flds) {
        try {
          const fields = JSON.parse(note.flds) as Array<{ name: string; value: string }>;
          if (fields.length > 0) {
            // Get the first field's value and strip HTML
            front = (fields[0]?.value || '').replace(/<[^>]*>/g, '').trim();
            if (front.length > 100) {
              front = front.substring(0, 100) + '...';
            }
          }
        } catch {
          front = note.sfld || '';
        }
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
        fields: note ? this.parseNoteFields(note.flds, note.sfld) : {},
        tags: note ? this.parseNoteTags(note.tags) : [],
        mid: Number(note?.mid || 0),
        notetypeName: notetype?.name || 'Unknown',
        notetypeType: notetype?.type || 0,
        addedAt: Number(card.id) < 100000000000 ? Number(card.id) : Math.floor(Number(card.id) / 1000),
        mod: note?.mod || card.mod,
      };
    });

    return { cards: result, total };
  }

  /**
   * Parse note fields from JSON string
   */
  private parseNoteFields(fldsJson: string | null, sfld: string | null): Record<string, string> {
    if (!fldsJson) {
      return {};
    }
    try {
      const fields = JSON.parse(fldsJson) as Array<{ name: string; value: string }>;
      const result: Record<string, string> = {};
      for (const field of fields) {
        result[field.name] = field.value;
      }
      return result;
    } catch {
      return { Front: sfld || '' };
    }
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
   * Perform bulk card operations
   */
  async bulkCardOperation(dto: BulkCardOperationDto): Promise<{ success: boolean; affected: number }> {
    const db = getDatabase();
    const { cardIds, action, payload } = dto;

    const now = Math.floor(Date.now() / 1000);
    let affected = 0;

    switch (action) {
      case 'suspend': {
        await db
          .update(echoeCards)
          .set({ queue: -1, mod: now, usn: 0 })
          .where(inArray(echoeCards.id, cardIds));
        affected = cardIds.length;
        break;
      }

      case 'unsuspend': {
        // Get cards to determine their type
        const cards = await db.select().from(echoeCards).where(inArray(echoeCards.id, cardIds));

        for (const card of cards) {
          const queue = card.type === 0 ? 0 : card.type === 1 ? 1 : 2;
          await db
            .update(echoeCards)
            .set({ queue, mod: now, usn: 0 })
            .where(eq(echoeCards.id, card.id));
        }
        affected = cards.length;
        break;
      }

      case 'bury': {
        await db
          .update(echoeCards)
          .set({ queue: -2, mod: now, usn: 0 })
          .where(inArray(echoeCards.id, cardIds));
        affected = cardIds.length;
        break;
      }

      case 'unbury': {
        const cards = await db.select().from(echoeCards).where(inArray(echoeCards.id, cardIds));

        for (const card of cards) {
          const queue = card.type === 0 ? 0 : card.type === 1 ? 1 : 2;
          await db
            .update(echoeCards)
            .set({ queue, mod: now, usn: 0 })
            .where(eq(echoeCards.id, card.id));
        }
        affected = cards.length;
        break;
      }

      case 'forget': {
        // Reset card scheduling
        await db
          .update(echoeCards)
          .set({
            queue: 0,
            due: 0,
            ivl: 0,
            factor: 0,
            reps: 0,
            lapses: 0,
            left: 0,
            mod: now,
            usn: 0,
          })
          .where(inArray(echoeCards.id, cardIds));
        affected = cardIds.length;
        break;
      }

      case 'move': {
        if (!payload?.deckId) {
          throw new Error('deckId is required for move action');
        }
        await db
          .update(echoeCards)
          .set({ did: payload.deckId, mod: now, usn: 0 })
          .where(inArray(echoeCards.id, cardIds));
        affected = cardIds.length;
        break;
      }

      case 'addTag': {
        if (!payload?.tag) {
          throw new Error('tag is required for addTag action');
        }
        const cards = await db.select({ nid: echoeCards.nid }).from(echoeCards).where(inArray(echoeCards.id, cardIds));
        const noteIds = Array.from(new Set(cards.map((c) => Number(c.nid)))) as number[];

        for (const nid of noteIds) {
          const note = await db.select().from(echoeNotes).where(eq(echoeNotes.id, nid)).limit(1);
          if (note.length > 0) {
            const tags = JSON.parse(note[0].tags || '[]') as string[];
            if (!tags.includes(payload.tag)) {
              tags.push(payload.tag);
              await db
                .update(echoeNotes)
                .set({ tags: JSON.stringify(tags), mod: now, usn: 0 })
                .where(eq(echoeNotes.id, nid));
            }
          }
        }
        affected = noteIds.length;
        break;
      }

      case 'removeTag': {
        if (!payload?.tag) {
          throw new Error('tag is required for removeTag action');
        }
        const cards = await db.select({ nid: echoeCards.nid }).from(echoeCards).where(inArray(echoeCards.id, cardIds));
        const noteIds = Array.from(new Set(cards.map((c) => Number(c.nid)))) as number[];

        for (const nid of noteIds) {
          const note = await db.select().from(echoeNotes).where(eq(echoeNotes.id, nid)).limit(1);
          if (note.length > 0) {
            const tags = JSON.parse(note[0].tags || '[]') as string[];
            const filteredTags = tags.filter((t) => t !== payload.tag);
            await db
              .update(echoeNotes)
              .set({ tags: JSON.stringify(filteredTags), mod: now, usn: 0 })
              .where(eq(echoeNotes.id, nid));
          }
        }
        affected = noteIds.length;
        break;
      }
    }

    return { success: true, affected };
  }

  /**
   * Get all note types with field and template definitions
   */
  async getAllNoteTypes(): Promise<EchoeNoteTypeDto[]> {
    const db = getDatabase();

    const notetypes = await db.select().from(echoeNotetypes).orderBy(echoeNotetypes.name);

    const result: EchoeNoteTypeDto[] = [];

    for (const nt of notetypes) {
      const templates = await db.select().from(echoeTemplates).where(eq(echoeTemplates.ntid, nt.id));

      // Get note count for this note type
      const noteCountResult = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(echoeNotes)
        .where(eq(echoeNotes.mid, Number(nt.id)));
      const noteCount = Number(noteCountResult[0]?.count || 0);

      result.push({
        id: Number(nt.id),
        name: nt.name,
        mod: nt.mod,
        sortf: nt.sortf,
        did: Number(nt.did),
        tmpls: templates.map((t) => ({
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
        noteCount,
      });
    }

    return result;
  }

  /**
   * Create a new note type
   * Supports cloning from an existing note type via cloneFrom parameter
   */
  async createNoteType(dto: CreateEchoeNoteTypeDto): Promise<EchoeNoteTypeDto> {
    const db = getDatabase();

    const now = Math.floor(Date.now() / 1000);
    const noteTypeId = Date.now();

    let fields = dto.flds;
    let templates = dto.tmpls;
    let css = dto.css;
    let latexPre = dto.latexPre;
    let latexPost = dto.latexPost;
    let noteType = 0;

    // If cloning from an existing note type
    if (dto.cloneFrom) {
      const sourceNotetype = await db.select().from(echoeNotetypes).where(eq(echoeNotetypes.id, dto.cloneFrom)).limit(1);
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
      const templateId = noteTypeId * 1000 + i;
      await db.insert(echoeTemplates).values({
        id: templateId,
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
  async updateNoteType(id: number, dto: UpdateEchoeNoteTypeDto): Promise<EchoeNoteTypeDto | null> {
    const db = getDatabase();

    const notetype = await db.select().from(echoeNotetypes).where(eq(echoeNotetypes.id, id)).limit(1);

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

    await db.update(echoeNotetypes).set(updates).where(eq(echoeNotetypes.id, id));

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
        await db.update(echoeNotetypes).set({ flds: JSON.stringify(newFields) }).where(eq(echoeNotetypes.id, id));
      }
    }

    // Add new templates if provided
    if (dto.tmpls) {
      const existingTemplates = JSON.parse(notetype[0].tmpls) as any[];
      const newOrd = existingTemplates.length;

      for (let i = 0; i < dto.tmpls.length; i++) {
        const t = dto.tmpls[i];
        const templateId = id * 1000 + newOrd + i;
        await db.insert(echoeTemplates).values({
          id: templateId,
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
    return this.getNoteTypeById(id);
  }

  /**
   * Delete a note type (rejects if notes exist)
   */
  async deleteNoteType(id: number): Promise<{ success: boolean; message?: string }> {
    const db = getDatabase();

    const notetype = await db.select().from(echoeNotetypes).where(eq(echoeNotetypes.id, id)).limit(1);

    if (notetype.length === 0) {
      return { success: false, message: 'Note type not found' };
    }

    // Check if any notes use this type
    const notes = await db.select({ count: sql<number>`COUNT(*)` }).from(echoeNotes).where(eq(echoeNotes.mid, id));
    const noteCount = Number(notes[0]?.count || 0);

    if (noteCount > 0) {
      return { success: false, message: `Cannot delete note type: ${noteCount} notes exist using this type` };
    }

    // Delete templates first
    await db.delete(echoeTemplates).where(eq(echoeTemplates.ntid, id));

    // Delete note type
    await db.delete(echoeNotetypes).where(eq(echoeNotetypes.id, id));

    return { success: true };
  }

  /**
   * Get note type by ID
   */
  async getNoteTypeById(id: number): Promise<EchoeNoteTypeDto | null> {
    const db = getDatabase();

    const notetype = await db.select().from(echoeNotetypes).where(eq(echoeNotetypes.id, id)).limit(1);

    if (notetype.length === 0) {
      return null;
    }

    const templates = await db.select().from(echoeTemplates).where(eq(echoeTemplates.ntid, id));

    // Get note count for this note type
    const noteCountResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(echoeNotes)
      .where(eq(echoeNotes.mid, id));
    const noteCount = Number(noteCountResult[0]?.count || 0);

    return {
      id: Number(notetype[0].id),
      name: notetype[0].name,
      mod: notetype[0].mod,
      sortf: notetype[0].sortf,
      did: Number(notetype[0].did),
      tmpls: templates.map((t) => ({
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
  private async getDeckAndSubdeckIds(id: number): Promise<number[]> {
    const db = getDatabase();
    const result: number[] = [id];

    const subDecks = await db
      .select()
      .from(echoeDecks)
      .where(sql`${echoeDecks.name} LIKE ${`${id}::%`}%`);

    for (const deck of subDecks) {
      result.push(Number(deck.id));
    }

    return result;
  }

  /**
   * Map database note to DTO
   */
  private mapNoteToDto(note: any): EchoeNoteDto {
    const fields: Record<string, string> = {};
    const fieldValues = (note.flds || '').split('\x1f');
    const fieldDefs = JSON.parse(note.flds || '[]');

    for (let i = 0; i < fieldDefs.length; i++) {
      fields[fieldDefs[i]?.name || `field_${i}`] = fieldValues[i] || '';
    }

    return {
      id: Number(note.id),
      guid: note.guid,
      mid: Number(note.mid),
      mod: note.mod,
      tags: JSON.parse(note.tags || '[]'),
      fields,
      sfld: note.sfld,
      csum: Number(note.csum),
      flags: note.flags,
      data: note.data,
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

  /**
   * Clean sort field (remove formatting)
   */
  private cleanSortField(value: string): string {
    // Remove HTML tags, trim, and truncate
    return value.replace(/<[^>]*>/g, '').trim().substring(0, 191);
  }

  /**
   * Calculate checksum (simple hash)
   */
  private calculateChecksum(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}
