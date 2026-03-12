import { Service } from 'typedi';
import { eq, and, sql, desc } from 'drizzle-orm';
import { getDatabase } from '../db/connection.js';
import { echoeCards, echoeNotes, echoeRevlog, echoeCol, echoeDecks, echoeDeckConfig, echoeNotetypes } from '../db/schema/index.js';
import { FSRSService, Rating, State } from './fsrs.service.js';
import { EchoeDeckService } from './echoe-deck.service.js';
import type { FSRSConfig } from './fsrs.service.js';

import type {
  StudyQueueParams,
  StudyQueueItemDto,
  ReviewSubmissionDto,
  ReviewResultDto,
  StudyCountsDto,
  UndoResultDto,
  BuryCardsDto,
  StudyOptionsDto,
  RatingOptionDto,
} from '@echoe/dto';

@Service()
export class EchoeStudyService {
  constructor(
    private fsrsService: FSRSService,
    private echoeDeckService: EchoeDeckService
  ) {}

  /**
   * Get study queue for a deck
   */
  async getQueue(params: StudyQueueParams): Promise<StudyQueueItemDto[]> {
    const db = getDatabase();
    const limit = params.limit || 20;
    const now = Date.now();

    // Build conditions
    const conditions: any[] = [];

    // Filter by deck if provided
    if (params.deckId) {
      // Get all sub-deck IDs
      const deckIds = await this.echoeDeckService.getDeckAndSubdeckIds(params.deckId);
      conditions.push(sql`${echoeCards.did} IN (${sql.join(deckIds.map(d => sql`${d}`), sql`, `)})`);
    }

    // Preview mode: return new cards (queue=0) without due date check
    if (params.preview) {
      // Get new cards only
      conditions.push(eq(echoeCards.queue, 0));
    } else if (params.reviewAhead !== undefined && params.reviewAhead > 0) {
      // Review ahead: include cards due within N days
      const reviewAheadMs = params.reviewAhead * 24 * 60 * 60 * 1000;
      conditions.push(
        sql`(${echoeCards.queue} >= 0 AND ${echoeCards.due} <= ${now + reviewAheadMs})`
      );
    } else {
      // Standard: only get cards that are due or in learning/relearning
      // Queue: -1=suspended, -2=buried, 0=new, 1=learning, 2=review, 3=relearning
      // Due time is stored as Unix timestamp in milliseconds
      conditions.push(
        sql`(${echoeCards.queue} >= 0 AND ${echoeCards.due} <= ${now})`
      );
    }

    // Exclude suspended and buried cards (unless in preview mode for new cards)
    if (!params.preview) {
      conditions.push(sql`${echoeCards.queue} != -1`);
      conditions.push(sql`${echoeCards.queue} != -2`);
    }

    const cards = await db
      .select()
      .from(echoeCards)
      .where(and(...conditions))
      .orderBy(desc(echoeCards.due))
      .limit(limit);

    // Get note data for each card
    const result: StudyQueueItemDto[] = [];
    for (const card of cards) {
      const note = await db.query.echoeNotes.findFirst({
        where: eq(echoeNotes.id, card.nid),
      });

      if (!note) continue;

      // Get note type to access templates
      const noteType = await db.query.echoeNotetypes.findFirst({
        where: eq(echoeNotetypes.id, note.mid),
      });

      if (!noteType) continue;

      const templates = this.safeJsonParse<any[]>(noteType.tmpls, []);

      // Get the template for this card
      const template = templates[card.ord] || templates[0];
      if (!template) continue;

      // Build field map from fieldsJson (primary source)
      const fieldMap: Record<string, string> =
        note.fieldsJson && typeof note.fieldsJson === 'object' && Object.keys(note.fieldsJson).length > 0
          ? (note.fieldsJson as Record<string, string>)
          : {};

      // Determine cloze ordinal - for cloze cards, templateOrd IS the cloze ordinal
      const clozeOrdinal = noteType.type === 1 ? card.ord + 1 : 0;

      // Render front first so {{FrontSide}} in back template can be resolved.
      const front = this.renderTemplate(template.qfmt, fieldMap, 'front', clozeOrdinal);
      const backTemplate = this.injectFrontSide(template.afmt || template.qfmt, front);
      const back = this.renderTemplate(backTemplate, fieldMap, 'back', clozeOrdinal);

      result.push({
        cardId: card.id,
        noteId: card.nid,
        deckId: card.did,
        cardType: card.type,
        queue: card.queue,
        due: card.due,
        interval: card.ivl,
        factor: card.factor,
        reps: card.reps,
        lapses: card.lapses,
        left: card.left,
        notetypeId: note.mid,
        front,
        back,
        templateOrd: card.ord,
        notetypeType: noteType.type || 0,
        clozeOrdinal,
      });
    }

    return result;
  }

  /**
   * Submit a review for a card
   */
  async submitReview(dto: ReviewSubmissionDto): Promise<ReviewResultDto> {
    const db = getDatabase();
    const now = new Date();

    // Get the card
    const card = await db.query.echoeCards.findFirst({
      where: eq(echoeCards.id, dto.cardId),
    });

    if (!card) {
      throw new Error('Card not found');
    }

    // Get the note
    const note = await db.query.echoeNotes.findFirst({
      where: eq(echoeNotes.id, card.nid),
    });

    if (!note) {
      throw new Error('Note not found');
    }

    // Get the deck
    const deck = await db.query.echoeDecks.findFirst({
      where: eq(echoeDecks.id, card.did),
    });

    if (!deck) {
      throw new Error('Deck not found');
    }

    // Get deck config
    const deckConfig = await db.query.echoeDeckConfig.findFirst({
      where: eq(echoeDeckConfig.id, deck.conf),
    });

    // Build FSRS config from deck config
    const fsrsConfig = this.getFSRSConfig(deckConfig);

    // Calculate elapsed_days since last review
    // dayMs = 24 * 60 * 60 * 1000 = 86400000
    const dayMs = 24 * 60 * 60 * 1000;
    const elapsedDays = card.lastReview && card.lastReview > 0
      ? Math.max(0, (now.getTime() - card.lastReview) / dayMs)
      : 0;

    // Create FSRS card input from database card
    const fsCardInput = {
      due: new Date(card.due),
      stability: card.factor / 1000, // Convert from permille to decimal
      difficulty: 0, // Will be calculated by FSRS
      elapsed_days: elapsedDays,
      scheduled_days: card.ivl,
      learning_steps: card.left,
      reps: card.reps,
      lapses: card.lapses,
      state: card.type as State,
      last_review: undefined,
    };

    // Calculate new scheduling using FSRS
    const schedulingResult = this.fsrsService.scheduleCard(
      fsCardInput,
      dto.rating,
      now,
      fsrsConfig
    );

    // Determine new card state
    let newState = schedulingResult.state;
    let newQueue = this.stateToQueue(schedulingResult.state);

    // Handle learning/relearning steps
    if (newState === State.Learning || newState === State.Relearning) {
      // Card stays in learning queue
      newQueue = newState === State.Learning ? 1 : 3;
    }

    // Calculate next due time in milliseconds
    const nextDue = schedulingResult.nextDue.getTime();
    const graduated = newState === State.Review && card.type !== 2;

    // Preview mode: skip updating card state and writing revlog
    if (dto.preview) {
      return {
        card: {
          ...card,
          nid: card.nid,
          did: card.did,
          due: card.due,
          ivl: card.ivl,
          factor: card.factor,
          left: card.left,
          note: note ? {
            ...note,
            id: note.id,
            mid: note.mid,
            mod: note.mod,
            csum: note.csum,
            tags: this.parseTags(note.tags),
            fields: this.parseNoteFields(note.fieldsJson as Record<string, string> | null, note.sfld),
          } : undefined,
        } as any,
        nextDue,
        nextInterval: schedulingResult.interval,
        nextFactor: schedulingResult.stability,
        graduated,
        isLeech: false,
      };
    }

    // Update the card with new scheduling
    await db
      .update(echoeCards)
      .set({
        due: nextDue,
        ivl: schedulingResult.interval,
        factor: Math.round(schedulingResult.stability * 1000),
        reps: card.reps + 1,
        lapses: schedulingResult.state === State.Relearning ? card.lapses + 1 : card.lapses,
        left: 0, // Reset steps
        type: newState,
        queue: newQueue,
        mod: Math.floor(now.getTime() / 1000),
        usn: -1,
        // FSRS fields
        stability: schedulingResult.stability,
        difficulty: schedulingResult.difficulty,
        lastReview: now.getTime(),
      })
      .where(eq(echoeCards.id, dto.cardId));

    // Log the review (type=4 for custom study)
    const reviewTime = Math.floor(Date.now() / 1000);
    await db.insert(echoeRevlog).values({
      id: reviewTime * 1000,
      cid: dto.cardId,
      nid: card.nid,
      lid: 0,
      ease: dto.rating,
      ivl: schedulingResult.interval,
      lastIvl: card.ivl,
      factor: Math.round(schedulingResult.stability * 1000),
      time: dto.timeTaken,
      type: 4, // Custom study type
      step: card.left,
      id_: reviewTime * 1000,
      cid_: card.nid,
      nid_: card.nid,
      lid_: 0,
    });

    // Leech detection - check if card lapsed and exceeds threshold
    let isLeech = false;
    const lapseConfig = deckConfig?.lapseConfig ? JSON.parse(deckConfig.lapseConfig) : null;
    const leechFails = lapseConfig?.leechFails || 8;
    const newLapses = schedulingResult.state === State.Relearning ? card.lapses + 1 : card.lapses;

    if (newLapses >= leechFails) {
      isLeech = true;
      // Suspend the leech card
      await db
        .update(echoeCards)
        .set({
          queue: -1, // Suspended
          mod: Math.floor(now.getTime() / 1000),
          usn: -1,
        })
        .where(eq(echoeCards.id, dto.cardId));

      // Add 'leech' tag to the note if not already present
      const currentTags = this.parseTags(note.tags);
      if (!currentTags.includes('leech')) {
        currentTags.push('leech');
        await db
          .update(echoeNotes)
          .set({
            tags: JSON.stringify(currentTags),
            mod: Math.floor(now.getTime() / 1000),
            usn: -1,
          })
          .where(eq(echoeNotes.id, card.nid));
      }
    }

    // Handle buryRelated: auto-bury siblings after review
    const newConfig = deckConfig?.newConfig ? JSON.parse(deckConfig.newConfig) : null;
    const buryRelated = newConfig?.bury || false;
    if (buryRelated && !isLeech) {
      // Get all sibling cards (same note, different ordinal)
      const siblings = await db
        .select()
        .from(echoeCards)
        .where(and(
          eq(echoeCards.nid, card.nid),
          sql`${echoeCards.id} != ${dto.cardId}`,
          sql`${echoeCards.queue} >= 0` // Only bury cards that are not already suspended/buried
        ));

      if (siblings.length > 0) {
        const siblingIds = siblings.map(s => s.id);
        await db
          .update(echoeCards)
          .set({
            queue: -3, // Sibling buried
            mod: Math.floor(now.getTime() / 1000),
            usn: -1,
          })
          .where(sql`${echoeCards.id} IN (${sql.join(siblingIds.map(id => sql`${id}`), sql`, `)})`);
      }
    }

    // Return the updated card
    const updatedCard = await db.query.echoeCards.findFirst({
      where: eq(echoeCards.id, dto.cardId),
    });

    if (!updatedCard) {
      throw new Error('Failed to get updated card');
    }

    const fullNote = await db.query.echoeNotes.findFirst({
      where: eq(echoeNotes.id, updatedCard.nid),
    });

    return {
      card: {
        ...updatedCard,
        nid: updatedCard.nid,
        did: updatedCard.did,
        due: updatedCard.due,
        ivl: updatedCard.ivl,
        factor: updatedCard.factor,
        left: updatedCard.left,
        note: fullNote ? {
          ...fullNote,
          id: fullNote.id,
          mid: fullNote.mid,
          mod: fullNote.mod,
          csum: fullNote.csum,
          tags: this.parseTags(fullNote.tags),
          fields: this.parseNoteFields(fullNote.fieldsJson as Record<string, string> | null, fullNote.sfld),
        } : undefined,
      } as any,
      nextDue,
      nextInterval: schedulingResult.interval,
      nextFactor: schedulingResult.stability,
      graduated,
      isLeech,
    };
  }

  /**
   * Undo the last review
   */
  async undo(reviewId?: number): Promise<UndoResultDto> {
    const db = getDatabase();

    // Get the most recent revlog entry
    const lastReview = await db.query.echoeRevlog.findFirst({
      where: reviewId ? eq(echoeRevlog.id, reviewId) : undefined,
      orderBy: [desc(echoeRevlog.id)],
    });

    if (!lastReview) {
      return {
        success: false,
        message: 'No review to undo',
      };
    }

    // Get the card at that point
    const card = await db.query.echoeCards.findFirst({
      where: eq(echoeCards.id, lastReview.cid),
    });

    if (!card) {
      return {
        success: false,
        message: 'Card not found',
      };
    }

    // Restore card to previous state
    const now = Math.floor(Date.now() / 1000);
    const lastIvl = lastReview.lastIvl;
    await db
      .update(echoeCards)
      .set({
        due: lastIvl > 0 ? lastIvl * 24 * 60 * 60 * 1000 : 0,
        ivl: lastIvl,
        factor: lastReview.factor,
        reps: Math.max(0, card.reps - 1),
        lapses: card.lapses,
        left: lastReview.step,
        type: lastReview.type,
        queue: lastReview.type,
        mod: now,
        usn: -1,
      })
      .where(eq(echoeCards.id, lastReview.cid));

    // Remove the revlog entry
    await db.delete(echoeRevlog).where(eq(echoeRevlog.id, lastReview.id));

    return {
      success: true,
      message: 'Review undone',
    };
  }

  /**
   * Bury cards (move to buried queue)
   * @param cardIds - Card IDs to bury
   * @param mode - 'card' for single card bury (queue=-2), 'note' for sibling bury (queue=-3)
   */
  async buryCards(cardIds: number[], mode: 'card' | 'note' = 'card'): Promise<void> {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    if (mode === 'note') {
      // Bury all sibling cards (same note, different ordinal)
      const noteIds = new Set<number>();
      for (const cardId of cardIds) {
        const card = await db.query.echoeCards.findFirst({
          where: eq(echoeCards.id, cardId),
        });
        if (card) {
          noteIds.add(card.nid);
        }
      }

      // Get all sibling cards for these notes
      const siblingConditions = Array.from(noteIds).map(nid =>
        sql`${echoeCards.nid} = ${nid}`
      );
      if (siblingConditions.length > 0) {
        await db
          .update(echoeCards)
          .set({
            queue: -3, // Sibling buried
            mod: now,
            usn: -1,
          })
          .where(and(
            sql`(${sql.join(siblingConditions, sql` OR `)})`,
            sql`${echoeCards.queue} >= 0` // Only bury cards that are not already suspended/buried
          ));
      }
    } else {
      // Single card bury (queue=-2)
      await db
        .update(echoeCards)
        .set({
          queue: -2, // Manually buried
          mod: now,
          usn: -1,
        })
        .where(sql`${echoeCards.id} IN (${sql.join(cardIds.map(id => sql`${id}`), sql`, `)})`);
    }
  }

  /**
   * Forget cards (reset to new)
   */
  async forgetCards(cardIds: number[]): Promise<void> {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);
    const newDue = Math.floor(Date.now() / 1000) * 1000; // Current time in ms

    await db
      .update(echoeCards)
      .set({
        due: newDue,
        ivl: 0,
        factor: 2500,
        reps: 0,
        lapses: 0,
        left: 0,
        type: 0, // New
        queue: 0, // New queue
        mod: now,
        usn: -1,
      })
      .where(sql`${echoeCards.id} IN (${sql.join(cardIds.map(id => sql`${id}`), sql`, `)})`);
  }

  /**
   * Unbury cards at day boundary
   * Resets all buried cards (queue=-2 or queue=-3) to their previous queue value
   */
  async unburyAtDayBoundary(): Promise<number> {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    // Get all buried cards
    const buriedCards = await db
      .select()
      .from(echoeCards)
      .where(sql`${echoeCards.queue} IN (-2, -3)`);

    let unburiedCount = 0;

    for (const card of buriedCards) {
      // Infer previous queue from card type
      // type: 0=new, 1=learning, 2=review, 3=relearning
      let newQueue: number;

      if (card.type === 0) {
        // Was new
        newQueue = 0;
      } else if (card.type === 1) {
        // Was in learning queue
        newQueue = 1;
      } else if (card.type === 3) {
        // Was in relearning queue
        newQueue = 3;
      } else {
        // Was review (type=2) or unknown
        newQueue = 2;
      }

      await db
        .update(echoeCards)
        .set({
          queue: newQueue,
          mod: now,
          usn: -1,
        })
        .where(eq(echoeCards.id, card.id));

      unburiedCount++;
    }

    return unburiedCount;
  }

  /**
   * Get study counts for a deck
   */
  async getCounts(deckId?: number): Promise<StudyCountsDto> {
    const db = getDatabase();
    const now = Date.now();

    // Build conditions
    let deckFilter: any = undefined;
    if (deckId) {
      const deckIds = await this.echoeDeckService.getDeckAndSubdeckIds(deckId);
      deckFilter = sql`${echoeCards.did} IN (${sql.join(deckIds.map(d => sql`${d}`), sql`, `)})`;
    }

    // New cards (queue=0)
    const newConditions = deckFilter
      ? [deckFilter, eq(echoeCards.queue, 0)]
      : [eq(echoeCards.queue, 0)];
    const newCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(echoeCards)
      .where(and(...newConditions))
      .then((r) => r[0]?.count || 0);

    // Learning cards (queue=1 or queue=3)
    const learnConditions = deckFilter
      ? [deckFilter, sql`${echoeCards.queue} IN (1, 3)`]
      : [sql`${echoeCards.queue} IN (1, 3)`];
    const learnCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(echoeCards)
      .where(and(...learnConditions))
      .then((r) => r[0]?.count || 0);

    // Review cards (queue=2 and due <= now)
    const reviewConditions = deckFilter
      ? [deckFilter, eq(echoeCards.queue, 2), sql`${echoeCards.due} <= ${now}`]
      : [eq(echoeCards.queue, 2), sql`${echoeCards.due} <= ${now}`];
    const reviewCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(echoeCards)
      .where(and(...reviewConditions))
      .then((r) => r[0]?.count || 0);

    return {
      newCount,
      learnCount,
      reviewCount,
      totalCount: newCount + learnCount + reviewCount,
    };
  }

  /**
   * Get scheduling options for a card (preview of all rating outcomes)
   */
  async getOptions(cardId: number): Promise<StudyOptionsDto> {
    const db = getDatabase();
    const now = new Date();

    // Get the card
    const card = await db.query.echoeCards.findFirst({
      where: eq(echoeCards.id, cardId),
    });

    if (!card) {
      throw new Error('Card not found');
    }

    // Get the deck
    const deck = await db.query.echoeDecks.findFirst({
      where: eq(echoeDecks.id, card.did),
    });

    if (!deck) {
      throw new Error('Deck not found');
    }

    // Get deck config
    const deckConfig = await db.query.echoeDeckConfig.findFirst({
      where: eq(echoeDeckConfig.id, deck.conf),
    });

    // Build FSRS config from deck config
    const fsrsConfig = this.getFSRSConfig(deckConfig);

    // Calculate elapsed_days since last review
    const dayMs = 24 * 60 * 60 * 1000;
    const elapsedDays = card.lastReview && card.lastReview > 0
      ? Math.max(0, (now.getTime() - card.lastReview) / dayMs)
      : 0;

    // Create FSRS card input from database card
    const fsCardInput = {
      due: new Date(card.due),
      stability: card.stability || card.factor / 1000, // Use stability if available, fallback to factor
      difficulty: card.difficulty || 0, // Will be calculated by FSRS
      elapsed_days: elapsedDays,
      scheduled_days: card.ivl,
      learning_steps: card.left,
      reps: card.reps,
      lapses: card.lapses,
      state: card.type as State,
      last_review: undefined,
    };

    // Get all scheduling options using FSRS
    const schedulingOutput = this.fsrsService.getSchedulingOptions(
      fsCardInput,
      now,
      fsrsConfig
    );

    // Build rating labels
    const ratingLabels: Record<number, string> = {
      1: 'Again',
      2: 'Hard',
      3: 'Good',
      4: 'Easy',
    };

    // Build options array
    const options: RatingOptionDto[] = [];

    for (const rating of [1, 2, 3, 4] as const) {
      const output = schedulingOutput[rating];
      if (output) {
        options.push({
          rating,
          label: ratingLabels[rating],
          interval: output.interval,
          due: output.nextDue.getTime(),
          stability: output.stability,
          difficulty: output.difficulty,
        });
      }
    }

    return {
      cardId,
      options,
    };
  }

  /**
   * Safely parse JSON with fallback
   */
  private safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
    if (!json) return fallback;
    try {
      return JSON.parse(json) as T;
    } catch {
      return fallback;
    }
  }

  /**
   * Parse note fields into a record, preferring fieldsJson as primary source
   */
  private parseNoteFields(fieldsJson: Record<string, string> | null | undefined, sfld: string | null): Record<string, string> {
    if (fieldsJson && typeof fieldsJson === 'object' && Object.keys(fieldsJson).length > 0) {
      return fieldsJson;
    }
    return sfld ? { Front: sfld } : {};
  }

  /**
   * Parse tags from storage
   */
  private parseTags(tagsJson: string | null): string[] {
    if (!tagsJson) return [];
    try {
      const parsed = JSON.parse(tagsJson);
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === 'string');
      }
    } catch {
      // Not JSON, might be space-delimited (Anki format)
      if (typeof tagsJson === 'string') {
        return tagsJson.trim().split(/\s+/).filter(Boolean);
      }
    }
    return [];
  }

  /**
   * Replace {{FrontSide}} in back template with rendered front content.
   */
  private injectFrontSide(template: string, frontContent: string): string {
    return template.replace(/\{\{\s*FrontSide\s*\}\}/g, () => frontContent);
  }

  /**
   * Simple template rendering
   */
  private renderTemplate(template: string, fields: Record<string, string>, side: 'front' | 'back' = 'front', clozeOrdinal: number = 1): string {
    let result = template;

    // Replace field variables {{FieldName}}
    for (const [key, value] of Object.entries(fields)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    // Handle cloze deletions {{cN::text}} or {{cN::text::hint}}
    // For cloze cards, we need to process based on the card's ordinal
    result = result.replace(/\{\{c(\d+)::([^:}]+)(?:::([^}]+))?\}\}/g, (_fullMatch, ordStr, text, hint) => {
      const ord = parseInt(ordStr, 10);
      const isActive = ord === clozeOrdinal;

      if (side === 'back') {
        // On back: show all clozes as plain text
        return text;
      }

      // On front
      if (isActive) {
        // Active cloze
        if (hint) {
          // Show hint
          return `[${hint}]`;
        }
        // Show placeholder
        return '[...]';
      }

      // Inactive cloze: show text
      return text;
    });

    // Handle {{cloze:FieldName}} syntax (legacy)
    for (const [key, value] of Object.entries(fields)) {
      result = result.replace(new RegExp(`{{cloze:${key}}}`, 'g'), value);
    }

    // Handle type-in-answer {{type:FieldName}}
    // On front: render as a placeholder input that frontend can replace
    // On back: render as the actual field value (the correct answer)
    result = result.replace(/\{\{type:([^}]+)\}\}/g, (_fullMatch, fieldName) => {
      const trimmedName = fieldName.trim();
      const fieldValue = fields[trimmedName] || '';

      if (side === 'back') {
        // On back: show the correct answer
        return fieldValue;
      }

      // On front: render as a placeholder that frontend can replace with input
      // Use a special placeholder format that frontend CardRenderer can parse
      return `<input type="text" class="type-answer" data-field="${trimmedName}" placeholder="${fieldValue}" />`;
    });

    return result;
  }

  /**
   * Convert FSRS state to queue
   */
  private stateToQueue(state: State): number {
    switch (state) {
      case State.New:
        return 0;
      case State.Learning:
        return 1;
      case State.Review:
        return 2;
      case State.Relearning:
        return 3;
      default:
        return 0;
    }
  }

  /**
   * Build FSRS config from deck config
   */
  private getFSRSConfig(deckConfig: any): FSRSConfig {
    if (!deckConfig) {
      return {};
    }

    const newConfig = deckConfig.newConfig ? JSON.parse(deckConfig.newConfig) : null;
    const revConfig = deckConfig.revConfig ? JSON.parse(deckConfig.revConfig) : null;
    const lapseConfig = deckConfig.lapseConfig ? JSON.parse(deckConfig.lapseConfig) : null;

    return {
      learningSteps: newConfig?.steps ? newConfig.steps.map((s: number) => `${s}m`) : ['1m', '10m'],
      relearningSteps: lapseConfig?.steps ? lapseConfig.steps.map((s: number) => `${s}m`) : ['10m'],
      graduatingInterval: newConfig?.graduatingInterval || 1,
      easyIntervalMultiplier: newConfig?.easyInterval || 1.3,
      intervalMultiplier: revConfig?.intervalModifier || 2.5,
      maxInterval: revConfig?.maxInterval || 36500,
    };
  }
}
