import { Service } from 'typedi';
import { eq, and, sql, desc, asc, isNull, or } from 'drizzle-orm';
import { getDatabase } from '../db/connection.js';
import { echoeCards, echoeNotes, echoeRevlog, echoeCol, echoeDecks, echoeDeckConfig, echoeNotetypes, users } from '../db/schema/index.js';
import type { Card } from 'ts-fsrs';
import { z } from 'zod';

import { FSRSService, Rating, State } from './fsrs.service.js';
import { EchoeDeckService } from './echoe-deck.service.js';
import { DEFAULT_FSRS_RUNTIME_CONFIG } from './fsrs-default-config.js';
import { logger } from '../utils/logger.js';
import { calculateRetrievability } from '../utils/fsrs-retrievability.js';
import { generateRevlogId } from '../utils/id.js';
import { parseStepToMinutes, minutesToFsrsSteps } from '../utils/fsrs-steps.js';
import type { FSRSConfig, FSRSInput } from './fsrs.service.js';

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

/**
 * Internal type for FSRS card input built from database card.
 * For new cards we pass through native FSRS Card initialization.
 */
type FSRSCardInput = FSRSInput | Card;
type StudyReviewResultDto = ReviewResultDto & { reviewId?: number };

type FsrsTimingContext = {
  elapsedDays: number;
  lastReview?: Date;
};

const FSRS_REQUEST_RETENTION_SCHEMA = z.coerce.number().min(0.7).max(0.99);
const FSRS_MAX_INTERVAL_SCHEMA = z.coerce.number().int().min(1).max(36500);
const FSRS_BOOLEAN_SCHEMA = z.boolean();
const FSRS_STEPS_SCHEMA = z.array(z.union([z.number(), z.string()])).min(1).max(20);
const FSRS_LEGACY_DIFFICULTY_FALLBACK = 2.5;

@Service()
export class EchoeStudyService {
  constructor(
    private fsrsService: FSRSService,
    private echoeDeckService: EchoeDeckService
  ) {}

  /**
   * Get study queue for a deck
   */
  async getQueue(uid: string, params: StudyQueueParams): Promise<StudyQueueItemDto[]> {
    const db = getDatabase();
    const limit = params.limit || 20;
    const now = Date.now();

    // Build conditions
    const conditions: any[] = [eq(echoeCards.uid, uid)];

    // Filter by deck if provided
    if (params.deckId) {
      // Get all sub-deck IDs
      const deckIds = await this.echoeDeckService.getDeckAndSubdeckIds(uid, params.deckId);
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
      .orderBy(
        // 优先级：learning(1)/relearning(3) > review(2) > new(0)，同优先级按 due 升序（最早到期优先）
        sql`CASE WHEN ${echoeCards.queue} IN (1, 3) THEN 0
                 WHEN ${echoeCards.queue} = 2 THEN 1
                 ELSE 2 END`,
        asc(echoeCards.due)
      )
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

      // Calculate retrievability for this card (use Date.now() for current time)
      const retrievability = calculateRetrievability(card.lastReview, card.stability, now).value;

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
        retrievability,
      });
    }

    return result;
  }

  /**
   * Submit a review for a card
   */
  async submitReview(uid: string, dto: ReviewSubmissionDto): Promise<StudyReviewResultDto> {
    const db = getDatabase();
    const now = new Date();

    // Get the card
    const card = await db.query.echoeCards.findFirst({
      where: and(eq(echoeCards.uid, uid), eq(echoeCards.id, dto.cardId)),
    });

    if (!card) {
      throw new Error('Card not found');
    }

    // Get the note
    const note = await db.query.echoeNotes.findFirst({
      where: and(eq(echoeNotes.uid, uid), eq(echoeNotes.id, card.nid)),
    });

    if (!note) {
      throw new Error('Note not found');
    }

    // Get the deck
    const deck = await db.query.echoeDecks.findFirst({
      where: and(eq(echoeDecks.uid, uid), eq(echoeDecks.id, card.did)),
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

    // Build FSRS card input from database card (uses real FSRS fields)
    const fsCardInput = this.buildFSRSCardInput(card, now);

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
    const graduated = newState === State.Review && card.type === State.Learning;

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
        left: schedulingResult.learningSteps, // 写回 ts-fsrs 管理的步骤计数，保留 Learning 步骤进度
        type: newState,
        queue: newQueue,
        mod: Math.floor(now.getTime() / 1000),
        usn: -1,
        // FSRS fields
        stability: schedulingResult.stability,
        difficulty: schedulingResult.difficulty,
        lastReview: now.getTime(),
      })
      .where(and(eq(echoeCards.id, dto.cardId), eq(echoeCards.uid, uid)));

    const revlogType = this.resolveRevlogType(card, deck);
    const reviewId = generateRevlogId();

    // Log the review using pre-review card state
    await db.insert(echoeRevlog).values({
      id: reviewId,
      cid: dto.cardId,
      uid,
      usn: -1,
      ease: dto.rating,
      ivl: schedulingResult.interval,
      lastIvl: card.ivl,
      factor: Math.round(schedulingResult.stability * 1000),
      time: dto.timeTaken,
      type: revlogType,
      // FSRS fields (post-review state)
      stability: schedulingResult.stability,
      difficulty: schedulingResult.difficulty,
      lastReview: now.getTime(),
      // Pre-review snapshot (for undo functionality)
      preDue: card.due,
      preIvl: card.ivl,
      preFactor: card.factor,
      preReps: card.reps,
      preLapses: card.lapses,
      preLeft: card.left,
      preType: card.type,
      preQueue: card.queue,
      preStability: card.stability,
      preDifficulty: card.difficulty,
      preLastReview: card.lastReview,
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
        .where(and(eq(echoeCards.id, dto.cardId), eq(echoeCards.uid, uid)));

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
          .where(and(eq(echoeNotes.id, card.nid), eq(echoeNotes.uid, uid)));
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
          eq(echoeCards.uid, uid),
          eq(echoeCards.nid, card.nid),
          sql`${echoeCards.id} != ${dto.cardId}`,
          sql`${echoeCards.queue} >= 0` // Only bury cards that are not already suspended/buried
        ));

      if (siblings.length > 0) {
        const siblingIds = siblings.map((s: { id: number }) => s.id);
        await db
          .update(echoeCards)
          .set({
            queue: -3, // Sibling buried
            mod: Math.floor(now.getTime() / 1000),
            usn: -1,
          })
          .where(and(
            eq(echoeCards.uid, uid),
            sql`${echoeCards.id} IN (${sql.join(siblingIds.map((id: number) => sql`${id}`), sql`, `)})`
          ));
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
      reviewId,
    };
  }

  /**
   * Undo the last review
   */
  async undo(uid: string, reviewId?: number): Promise<UndoResultDto> {
    const db = getDatabase();

    // Get the most recent revlog entry, always filter by uid for tenant isolation
    const lastReview = await db.query.echoeRevlog.findFirst({
      where: reviewId
        ? and(eq(echoeRevlog.uid, uid), eq(echoeRevlog.id, reviewId))
        : eq(echoeRevlog.uid, uid),
      orderBy: [desc(echoeRevlog.id)],
    });

    if (!lastReview) {
      return {
        success: false,
        message: 'No review to undo',
      };
    }

    // Verify ownership: the revlog uid must match the current user.
    // For legacy records without uid, we allow the undo to proceed (backward compatibility).
    if (lastReview.uid !== null && lastReview.uid !== undefined && lastReview.uid !== uid) {
      logger.warn('Undo ownership mismatch', {
        event: 'undo_ownership_mismatch',
        requestUid: uid,
        revlogUid: lastReview.uid,
        revlogId: lastReview.id,
        cardId: lastReview.cid,
      });
      return {
        success: false,
        message: 'Permission denied: this review does not belong to you',
      };
    }

    // Get the card at that point, filter by uid for tenant isolation
    const card = await db.query.echoeCards.findFirst({
      where: and(eq(echoeCards.uid, uid), eq(echoeCards.id, lastReview.cid)),
    });

    if (!card) {
      return {
        success: false,
        message: 'Card not found',
      };
    }

    // Restore card to previous state using pre-review snapshot
    const now = Math.floor(Date.now() / 1000);
    await db
      .update(echoeCards)
      .set({
        // Restore from pre-review snapshot (stored in revlog)
        due: lastReview.preDue,
        ivl: lastReview.preIvl,
        factor: lastReview.preFactor,
        reps: lastReview.preReps,
        lapses: lastReview.preLapses,
        left: lastReview.preLeft,
        type: lastReview.preType,
        queue: lastReview.preQueue,
        // Restore FSRS fields from pre-review snapshot
        stability: lastReview.preStability,
        difficulty: lastReview.preDifficulty,
        lastReview: lastReview.preLastReview,
        mod: now,
        usn: -1,
      })
      .where(and(eq(echoeCards.uid, uid), eq(echoeCards.id, lastReview.cid)));

    // Remove the revlog entry, include uid condition for defense in depth
    await db.delete(echoeRevlog).where(and(eq(echoeRevlog.uid, uid), eq(echoeRevlog.id, lastReview.id)));

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
  async buryCards(uid: string, cardIds: number[], mode: 'card' | 'note' = 'card'): Promise<void> {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    if (mode === 'note') {
      // Bury all sibling cards (same note, different ordinal)
      const noteIds = new Set<number>();
      for (const cardId of cardIds) {
        const card = await db.query.echoeCards.findFirst({
          where: and(eq(echoeCards.uid, uid), eq(echoeCards.id, cardId)),
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
            eq(echoeCards.uid, uid),
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
        .where(and(eq(echoeCards.uid, uid), sql`${echoeCards.id} IN (${sql.join(cardIds.map(id => sql`${id}`), sql`, `)})`))
    }
  }

  /**
   * Forget cards (reset to new) via FSRSService.forgetCard() to ensure
   * all FSRS fields (including factor = stability * 1000) are correctly reset.
   */
  async forgetCards(uid: string, cardIds: number[]): Promise<number> {
    const db = getDatabase();
    const now = new Date();
    const nowSec = Math.floor(now.getTime() / 1000);
    let affected = 0;

    for (const cardId of cardIds) {
      const card = await db.query.echoeCards.findFirst({
        where: and(eq(echoeCards.uid, uid), eq(echoeCards.id, cardId)),
      });
      if (!card) continue;

      const fsCard = this.fsrsService.toFSCard({
        due: new Date(card.due),
        stability: card.stability ?? 0,
        difficulty: card.difficulty ?? 0,
        elapsed_days: 0,
        scheduled_days: card.ivl,
        learning_steps: card.left,
        reps: card.reps,
        lapses: card.lapses,
        state: card.type as State,
        last_review: card.lastReview ? new Date(card.lastReview) : undefined,
      });

      const resetCard = this.fsrsService.forgetCard(fsCard, now, false);

      await db
        .update(echoeCards)
        .set({
          due: resetCard.due.getTime(),
          ivl: resetCard.scheduled_days,
          factor: Math.round(resetCard.stability * 1000), // stability=0 → factor=0，与 submitReview 语义一致
          reps: resetCard.reps,
          lapses: resetCard.lapses,
          left: resetCard.learning_steps,
          type: resetCard.state,
          queue: 0,
          mod: nowSec,
          usn: -1,
          stability: resetCard.stability,
          difficulty: resetCard.difficulty,
          lastReview: 0,
        })
        .where(and(eq(echoeCards.uid, uid), eq(echoeCards.id, cardId)));

      affected += 1;
    }

    return affected;
  }

  /**
   * Unbury buried cards for all active users at day boundary.
   */
  async unburyAtDayBoundaryForAllUsers(): Promise<{ userCount: number; unburiedCount: number }> {
    const db = getDatabase();

    const activeUsers = await db
      .select({ uid: users.uid })
      .from(users)
      .where(eq(users.deletedAt, 0));

    let unburiedCount = 0;

    for (const user of activeUsers) {
      if (!user.uid) {
        continue;
      }
      unburiedCount += await this.unburyAtDayBoundary(user.uid);
    }

    return {
      userCount: activeUsers.length,
      unburiedCount,
    };
  }

  /**
   * Unbury cards at day boundary for a specific user.
   * Card ownership is enforced by echoe_cards.uid, with revlog ownership as a secondary signal.
   */
  async unburyAtDayBoundary(uid: string): Promise<number> {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    if (!uid) {
      logger.warn('Skip unburyAtDayBoundary: missing uid', {
        event: 'study_unbury_missing_uid',
      });
      return 0;
    }

    // Find buried cards belonging to this user.
    //
    // Ownership is determined via two complementary paths:
    //   - hard tenant boundary: card row must belong to uid (echoe_cards.uid = uid)
    //   1. Cards with at least one revlog row whose uid matches → clearly owned by this user.
    //   2. Cards with NO revlog at all (e.g. brand-new cards that were sibling-buried before
    //      ever being reviewed) → they have no owner signal in revlog, so we include them to
    //      prevent permanent entombment. A LEFT JOIN with revlog.cid IS NULL captures this.
    //
    // Using INNER JOIN would miss path-2 cards entirely, leaving them buried forever.
    const buriedCards = await db
      .selectDistinct({
        id: echoeCards.id,
        type: echoeCards.type,
      })
      .from(echoeCards)
      .leftJoin(echoeRevlog, eq(echoeRevlog.cid, echoeCards.id))
      .where(
        and(
          eq(echoeCards.uid, uid),
          sql`${echoeCards.queue} IN (-2, -3)`,
          or(
            eq(echoeRevlog.uid, uid),      // path 1: has a revlog owned by this user
            isNull(echoeRevlog.cid)        // path 2: has no revlog at all (never reviewed)
          )
        )
      );

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
        .where(eq(echoeCards.id, Number(card.id)));

      unburiedCount++;
    }

    return unburiedCount;
  }

  /**
   * Get study counts for a deck
   */
  async getCounts(uid: string, deckId?: number): Promise<StudyCountsDto> {
    const db = getDatabase();
    const now = Date.now();

    // Build conditions
    let deckFilter: any = undefined;
    if (deckId) {
      const deckIds = await this.echoeDeckService.getDeckAndSubdeckIds(uid, deckId);
      deckFilter = sql`${echoeCards.did} IN (${sql.join(deckIds.map(d => sql`${d}`), sql`, `)})`;
    }

    // New cards (queue=0)
    const newConditions = deckFilter
      ? [eq(echoeCards.uid, uid), deckFilter, eq(echoeCards.queue, 0)]
      : [eq(echoeCards.uid, uid), eq(echoeCards.queue, 0)];
    const newCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(echoeCards)
      .where(and(...newConditions))
      .then((r: Array<{ count: number | string | bigint }>) => Number(r[0]?.count || 0));

    // Learning cards due now (queue=1 or queue=3 and due <= now)
    const learnConditions = deckFilter
      ? [eq(echoeCards.uid, uid), deckFilter, sql`${echoeCards.queue} IN (1, 3)`, sql`${echoeCards.due} <= ${now}`]
      : [eq(echoeCards.uid, uid), sql`${echoeCards.queue} IN (1, 3)`, sql`${echoeCards.due} <= ${now}`];
    const learnCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(echoeCards)
      .where(and(...learnConditions))
      .then((r: Array<{ count: number | string | bigint }>) => Number(r[0]?.count || 0));

    // Review cards (queue=2 and due <= now)
    const reviewConditions = deckFilter
      ? [eq(echoeCards.uid, uid), deckFilter, eq(echoeCards.queue, 2), sql`${echoeCards.due} <= ${now}`]
      : [eq(echoeCards.uid, uid), eq(echoeCards.queue, 2), sql`${echoeCards.due} <= ${now}`];
    const reviewCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(echoeCards)
      .where(and(...reviewConditions))
      .then((r: Array<{ count: number | string | bigint }>) => Number(r[0]?.count || 0));

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
  async getOptions(uid: string, cardId: number): Promise<StudyOptionsDto> {
    const db = getDatabase();
    const now = new Date();

    // Get the card
    const card = await db.query.echoeCards.findFirst({
      where: and(eq(echoeCards.uid, uid), eq(echoeCards.id, cardId)),
    });

    if (!card) {
      throw new Error('Card not found');
    }

    // Get the deck
    const deck = await db.query.echoeDecks.findFirst({
      where: and(eq(echoeDecks.uid, uid), eq(echoeDecks.id, card.did)),
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

    // Build FSRS card input from database card (uses real FSRS fields)
    const fsCardInput = this.buildFSRSCardInput(card, now);

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

    // Calculate current retrievability for this card
    const retrievability = calculateRetrievability(card.lastReview, card.stability, now.getTime()).value;

    return {
      cardId,
      options,
      retrievability,
    };
  }

  /**
   * Build normalized timing context for FSRS time fields.
   * - elapsed_days uses now - last_review
   * - future timestamps are clamped to now
   * - elapsed_days is capped to avoid extreme clock-drift outliers
   */
  private buildFsrsTimingContext(lastReviewMs: number, now: Date): FsrsTimingContext {
    const msPerDay = 24 * 60 * 60 * 1000;
    const maxElapsedDays = 36500; // 100 years, aligns with default maxInterval

    if (!Number.isFinite(lastReviewMs) || lastReviewMs <= 0) {
      return {
        elapsedDays: 0,
        lastReview: undefined,
      };
    }

    const nowMs = now.getTime();
    const normalizedLastReviewMs = Math.min(lastReviewMs, nowMs);
    const elapsedDays = Math.min(
      Math.max(0, (nowMs - normalizedLastReviewMs) / msPerDay),
      maxElapsedDays
    );

    return {
      elapsedDays,
      lastReview: new Date(normalizedLastReviewMs),
    };
  }

  /**
   * Build FSRS card input from database card.
   * Priority:
   * 1. Historical cards with real FSRS snapshots.
   * 2. New cards using native FSRS initialization (createEmptyCard path).
   * 3. Legacy compatibility fallback (degraded estimate path).
   */
  private buildFSRSCardInput(card: typeof echoeCards.$inferSelect, now: Date): FSRSCardInput {
    const hasFsrsHistory =
      Number.isFinite(card.stability)
      && Number.isFinite(card.difficulty)
      && Number.isFinite(card.lastReview)
      && card.stability > 0
      && card.difficulty > 0
      && card.lastReview > 0;

    if (hasFsrsHistory) {
      const timing = this.buildFsrsTimingContext(card.lastReview, now);
      return {
        due: new Date(card.due),
        stability: card.stability,
        difficulty: card.difficulty,
        elapsed_days: timing.elapsedDays,
        scheduled_days: Math.max(0, card.ivl),
        learning_steps: Math.max(0, card.left),
        reps: card.reps,
        lapses: card.lapses,
        state: card.type as State,
        last_review: timing.lastReview,
      };
    }

    const isUninitializedNewCard =
      card.type === State.New
      && card.reps === 0
      && card.ivl === 0
      && card.lastReview <= 0
      && card.stability <= 0
      && card.difficulty <= 0;

    if (isUninitializedNewCard) {
      // Delegate to ts-fsrs native initialization, avoid injecting pseudo memory values.
      return this.fsrsService.createCard(now);
    }

    const timing = this.buildFsrsTimingContext(card.lastReview, now);

    logger.warn('FSRS legacy fallback path hit', {
      event: 'fsrs_legacy_fallback',
      cardId: card.id,
      deckId: card.did,
      cardType: card.type,
      queue: card.queue,
      reps: card.reps,
      ivl: card.ivl,
      stability: card.stability,
      difficulty: card.difficulty,
      lastReview: card.lastReview,
    });

    // Compatibility path for old cards missing FSRS snapshots.
    return {
      due: new Date(card.due),
      stability: Math.max(1, card.ivl),
      difficulty: FSRS_LEGACY_DIFFICULTY_FALLBACK,
      elapsed_days: timing.elapsedDays,
      scheduled_days: Math.max(0, card.ivl),
      learning_steps: Math.max(0, card.left),
      reps: card.reps,
      lapses: card.lapses,
      state: card.type as State,
      last_review: timing.lastReview,
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
   * Resolve revlog.type from pre-review card state.
   * 0=learning/new, 1=review, 2=relearning, 4=custom/filtered.
   */
  private resolveRevlogType(
    card: Pick<typeof echoeCards.$inferSelect, 'id' | 'queue' | 'type'>,
    deck: Pick<typeof echoeDecks.$inferSelect, 'dyn'>
  ): number {
    if (deck.dyn === 1) {
      return 4;
    }

    if (card.queue === 3 || card.type === State.Relearning) {
      return 2;
    }

    if (card.queue === 2 || card.type === State.Review) {
      return 1;
    }

    if (
      card.queue === 0
      || card.queue === 1
      || card.type === State.New
      || card.type === State.Learning
    ) {
      return 0;
    }

    logger.warn('Unknown pre-review state, fallback revlog.type to custom study', {
      cardId: card.id,
      queue: card.queue,
      type: card.type,
    });

    return 4;
  }

  /**
   * Build FSRS config from deck config
   */
  private getFSRSConfig(deckConfig: any): FSRSConfig {
    const deckConfigId = typeof deckConfig?.id === 'number' ? deckConfig.id : null;
    const newConfig = this.parseDeckConfigSection(deckConfig?.newConfig);
    const revConfig = this.parseDeckConfigSection(deckConfig?.revConfig);
    const lapseConfig = this.parseDeckConfigSection(deckConfig?.lapseConfig);
    const fsrsSubConfig = this.getRecord(revConfig.fsrs);

    return {
      learningSteps: this.resolveFsrsSteps(
        [fsrsSubConfig.learningSteps, newConfig.steps, newConfig.delays, newConfig.newSteps],
        DEFAULT_FSRS_RUNTIME_CONFIG.learningSteps,
        'learningSteps',
        deckConfigId
      ),
      relearningSteps: this.resolveFsrsSteps(
        [fsrsSubConfig.relearningSteps, lapseConfig.steps, lapseConfig.delays],
        DEFAULT_FSRS_RUNTIME_CONFIG.relearningSteps,
        'relearningSteps',
        deckConfigId
      ),
      maxInterval: this.resolveFsrsNumber(
        [fsrsSubConfig.maxInterval, revConfig.maxInterval],
        FSRS_MAX_INTERVAL_SCHEMA,
        DEFAULT_FSRS_RUNTIME_CONFIG.maxInterval,
        'maxInterval',
        deckConfigId
      ),
      requestRetention: this.resolveFsrsNumber(
        [fsrsSubConfig.requestRetention],
        FSRS_REQUEST_RETENTION_SCHEMA,
        DEFAULT_FSRS_RUNTIME_CONFIG.requestRetention,
        'requestRetention',
        deckConfigId
      ),
      enableFuzz: this.resolveFsrsBoolean(
        [fsrsSubConfig.enableFuzz],
        DEFAULT_FSRS_RUNTIME_CONFIG.enableFuzz,
        'enableFuzz',
        deckConfigId
      ),
      enableShortTerm: this.resolveFsrsBoolean(
        [fsrsSubConfig.enableShortTerm],
        DEFAULT_FSRS_RUNTIME_CONFIG.enableShortTerm,
        'enableShortTerm',
        deckConfigId
      ),
    };
  }

  private parseDeckConfigSection(rawConfig: unknown): Record<string, unknown> {
    if (typeof rawConfig !== 'string' || rawConfig.trim() === '') {
      return {};
    }

    const parsed = this.safeJsonParse<unknown>(rawConfig, {});
    return this.getRecord(parsed);
  }

  private getRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private resolveFsrsSteps(
    candidates: unknown[],
    fallback: readonly string[],
    field: 'learningSteps' | 'relearningSteps',
    deckConfigId: number | null
  ): string[] {
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) {
        continue;
      }

      const parsedList = FSRS_STEPS_SCHEMA.safeParse(candidate);
      if (!parsedList.success) {
        this.logInvalidFsrsConfigValue(deckConfigId, field, candidate);
        continue;
      }

      const minutes: number[] = [];
      let hasInvalidStep = false;
      for (const rawStep of parsedList.data) {
        const minute = parseStepToMinutes(rawStep);
        if (minute === undefined) {
          hasInvalidStep = true;
          break;
        }
        minutes.push(minute);
      }

      if (hasInvalidStep) {
        this.logInvalidFsrsConfigValue(deckConfigId, field, candidate);
        continue;
      }

      return minutesToFsrsSteps(minutes);
    }

    return [...fallback];
  }

  private resolveFsrsNumber(
    candidates: unknown[],
    schema: z.ZodType<number>,
    fallback: number,
    field: 'maxInterval' | 'requestRetention',
    deckConfigId: number | null
  ): number {
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) {
        continue;
      }

      const parsed = schema.safeParse(candidate);
      if (parsed.success) {
        return parsed.data;
      }

      this.logInvalidFsrsConfigValue(deckConfigId, field, candidate);
    }

    return fallback;
  }

  private resolveFsrsBoolean(
    candidates: unknown[],
    fallback: boolean,
    field: 'enableFuzz' | 'enableShortTerm',
    deckConfigId: number | null
  ): boolean {
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) {
        continue;
      }

      const parsed = FSRS_BOOLEAN_SCHEMA.safeParse(candidate);
      if (parsed.success) {
        return parsed.data;
      }

      this.logInvalidFsrsConfigValue(deckConfigId, field, candidate);
    }

    return fallback;
  }

  private logInvalidFsrsConfigValue(deckConfigId: number | null, field: string, value: unknown): void {
    logger.warn('Invalid FSRS deck config detected, fallback to default', {
      event: 'fsrs_config_fallback',
      deckConfigId,
      field,
      value,
    });
  }
}
