import { Service } from 'typedi';
import { eq, and, inArray, like, sql } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { withTransaction } from '../db/transaction.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { echoeDeckConfig } from '../db/schema/echoe-deck-config.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeRevlog } from '../db/schema/echoe-revlog.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { echoeGraves } from '../db/schema/echoe-graves.js';
import { logger } from '../utils/logger.js';
import { DAY_MS, getRetrievabilitySqlExpr } from '../utils/fsrs-retrievability.js';
import { generateTypeId } from '../utils/id.js';
import { OBJECT_TYPE } from '../models/constant/type.js';
import { DEFAULT_FSRS_DTO_CONFIG } from './fsrs-default-config.js';
import { parseStepToMinutes } from '../utils/fsrs-steps.js';

import type { EchoeDecks, NewEchoeDecks } from '../db/schema/echoe-decks.js';
import type { EchoeDeckConfig, NewEchoeDeckConfig } from '../db/schema/echoe-deck-config.js';
import type { EchoeCards } from '../db/schema/echoe-cards.js';
import type { EchoeNotes } from '../db/schema/echoe-notes.js';

import type {
  EchoeDeckWithCountsDto,
  CreateEchoeDeckDto,
  CreateFilteredDeckDto,
  UpdateEchoeDeckDto,
  EchoeDeckConfigDto,
  UpdateEchoeDeckConfigDto,
  EchoeFsrsConfigDto,
  EchoeNewCardConfigDto,
  EchoeReviewConfigDto,
  EchoeLapseConfigDto,
  FilteredDeckPreviewDto,
  EchoeCardListItemDto,
} from '@echoe/dto';

@Service()
export class EchoeDeckService {
  /**
   * Get all decks with counts for today
   */
  async getAllDecks(uid: string): Promise<EchoeDeckWithCountsDto[]> {
    const db = getDatabase();

    // Get all decks
    const decks = await db.select().from(echoeDecks).where(eq(echoeDecks.uid, uid)).orderBy(echoeDecks.name);

    // Use millisecond timestamp semantics for all card due checks
    const nowMs = Date.now();

    // Get all cards grouped by deck
    const cardsWithCounts = await db
      .select({
        did: echoeCards.did,
        newCount: sql<number>`SUM(CASE WHEN ${echoeCards.queue} = 0 THEN 1 ELSE 0 END)`,
        learnCount: sql<number>`SUM(CASE WHEN ${echoeCards.queue} IN (1, 3) THEN 1 ELSE 0 END)`,
        reviewCount: sql<number>`SUM(CASE WHEN ${echoeCards.queue} = 2 AND ${echoeCards.due} <= ${nowMs} THEN 1 ELSE 0 END)`,
      })
      .from(echoeCards)
      .where(eq(echoeCards.uid, uid))
      .groupBy(echoeCards.did);

    // Get FSRS stats grouped by deck
    const now = Date.now();
    const retrievabilityExpr = getRetrievabilitySqlExpr(now, echoeCards.lastReview, echoeCards.stability);
    const cardsWithFsrsStats = await db
      .select({
        did: echoeCards.did,
        totalCount: sql<number>`COUNT(*)`,
        matureCount: sql<number>`SUM(CASE WHEN ${echoeCards.stability} >= 21 THEN 1 ELSE 0 END)`,
        // Retrievability R(t,S) = (1 + t/(9S))^(-1), difficult if R < 0.9
        // t = (now - lastReview) / DAY_MS, S = stability
        // R < 0.9 => 1 + t/(9S) > 10/9 => t/(9S) > 1/9 => t > S
        // Therefore difficult condition is: (now - lastReview) > stability * DAY_MS
        difficultCount: sql<number>`SUM(CASE WHEN ${echoeCards.lastReview} > 0 AND ${echoeCards.stability} > 0 AND (${now} - ${echoeCards.lastReview}) > (${echoeCards.stability} * ${DAY_MS}) THEN 1 ELSE 0 END)`,
        retrievabilityEligibleCount: sql<number>`SUM(CASE WHEN ${retrievabilityExpr} IS NULL THEN 0 ELSE 1 END)`,
        averageRetrievability: sql<number>`AVG(${retrievabilityExpr})`,
        lastStudiedAt: sql<number>`MAX(CASE WHEN ${echoeCards.lastReview} > 0 THEN ${echoeCards.lastReview} ELSE NULL END)`,
      })
      .from(echoeCards)
      .where(eq(echoeCards.uid, uid))
      .groupBy(echoeCards.did);

    // Batch-compute today's new card reviewed count per deck (for daily limit capping)
    const todayNewReviewedByDeck = await this.getTodayNewReviewedCountByDeck(uid);

    // Batch-fetch perDay config per deck config ID
    const perDayByConfId = await this.getPerDayByConfId(uid, decks);

    // Create maps for quick lookup
    const countsMap = new Map<string, { newCount: number; learnCount: number; reviewCount: number }>();
    for (const card of cardsWithCounts) {
      countsMap.set(card.did, {
        newCount: Number(card.newCount) || 0,
        learnCount: Number(card.learnCount) || 0,
        reviewCount: Number(card.reviewCount) || 0,
      });
    }

    const fsrsMap = new Map<
      string,
      {
        totalCount: number;
        matureCount: number;
        difficultCount: number;
        averageRetrievability: number;
        lastStudiedAt: number | null;
      }
    >();
    const retrievabilityEligibleCountMap = new Map<string, number>();
    for (const card of cardsWithFsrsStats) {
      const did = card.did;
      const retrievabilityEligibleCount = Number(card.retrievabilityEligibleCount) || 0;
      fsrsMap.set(did, {
        totalCount: Number(card.totalCount) || 0,
        matureCount: Number(card.matureCount) || 0,
        difficultCount: Number(card.difficultCount) || 0,
        averageRetrievability: Number(card.averageRetrievability) || 0,
        lastStudiedAt: card.lastStudiedAt ? Number(card.lastStudiedAt) : null,
      });
      retrievabilityEligibleCountMap.set(did, retrievabilityEligibleCount);
    }

    // Convert to DTOs with counts
    const DEFAULT_PER_DAY = 20;
    const decksWithCounts: EchoeDeckWithCountsDto[] = decks.map((deck: EchoeDecks) => {
      const counts = countsMap.get(deck.deckId) || { newCount: 0, learnCount: 0, reviewCount: 0 };
      const fsrs = fsrsMap.get(deck.deckId) || {
        totalCount: 0,
        matureCount: 0,
        difficultCount: 0,
        averageRetrievability: 0,
        lastStudiedAt: null,
      };

      // Apply daily new card limit: newCount = min(rawNewCount, max(0, perDay - todayNewReviewed))
      const rawNewCount = counts.newCount;
      const perDay = perDayByConfId.get(deck.conf) ?? DEFAULT_PER_DAY;
      const todayNewReviewed = todayNewReviewedByDeck.get(deck.deckId) ?? 0;
      const cappedNewCount = Math.min(rawNewCount, Math.max(0, perDay - todayNewReviewed));

      return {
        // Semantic business ID fields (preferred)
        deckId: deck.deckId,
        // @deprecated alias - retained for backwards compatibility
        id: deck.deckId,
        name: deck.name,
        conf: deck.conf,
        extendNew: deck.extendNew,
        extendRev: deck.extendRev,
        collapsed: deck.collapsed === 1,
        dyn: deck.dyn,
        desc: deck.desc || '',
        mid: deck.mid ?? '',
        mod: deck.mod,
        newCount: cappedNewCount,
        learnCount: counts.learnCount,
        reviewCount: counts.reviewCount,
        totalCount: fsrs.totalCount,
        matureCount: fsrs.matureCount,
        difficultCount: fsrs.difficultCount,
        averageRetrievability: fsrs.averageRetrievability,
        lastStudiedAt: fsrs.lastStudiedAt,
        children: [],
      };
    });

    // Build hierarchy
    return this.buildDeckHierarchy(decksWithCounts, retrievabilityEligibleCountMap);
  }

  /**
   * Batch-query today's new-card reviewed count grouped by deck.
   * Returns a Map<deckId, count>.
   */
  private async getTodayNewReviewedCountByDeck(uid: string): Promise<Map<string, number>> {
    const db = getDatabase();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    const rows = await db
      .select({
        did: echoeCards.did,
        count: sql<number>`count(*)`,
      })
      .from(echoeRevlog)
      .innerJoin(echoeCards, eq(echoeRevlog.cid, echoeCards.cardId))
      .where(
        and(
          eq(echoeRevlog.uid, uid),
          eq(echoeCards.uid, uid),
          eq(echoeRevlog.type, 0),
          sql`${echoeRevlog.lastReview} >= ${todayStart}`
        )
      )
      .groupBy(echoeCards.did);

    const result = new Map<string, number>();
    for (const row of rows) {
      result.set(row.did, Number(row.count) || 0);
    }
    return result;
  }

  /**
   * Batch-fetch perDay value from deck configs, keyed by config ID.
   */
  private async getPerDayByConfId(uid: string, decks: EchoeDecks[]): Promise<Map<string, number>> {
    const DEFAULT_PER_DAY = 20;
    if (decks.length === 0) {
      return new Map();
    }

    const confIds = [...new Set(decks.map((d: EchoeDecks) => d.conf))];
    const db = getDatabase();

    const configs = await db
      .select({ deckConfigId: echoeDeckConfig.deckConfigId, newConfig: echoeDeckConfig.newConfig })
      .from(echoeDeckConfig)
      .where(and(eq(echoeDeckConfig.uid, uid), inArray(echoeDeckConfig.deckConfigId, confIds)));

    const result = new Map<string, number>();
    for (const config of configs) {
      const perDay = this.parsePerDayFromNewConfig(config.newConfig, DEFAULT_PER_DAY);
      result.set(config.deckConfigId, perDay);
    }
    return result;
  }

  /**
   * Parse perDay value from newConfig JSON string.
   */
  private parsePerDayFromNewConfig(newConfigJson: string, defaultValue: number): number {
    try {
      const parsed = JSON.parse(newConfigJson) as Record<string, unknown>;
      const perDay = parsed.perDay;
      if (typeof perDay === 'number' && Number.isFinite(perDay) && perDay >= 0) {
        return perDay;
      }
    } catch {
      // ignore parse errors
    }
    return defaultValue;
  }

  /**
   * Build deck hierarchy from flat list with aggregated stats from child decks
   */
  private buildDeckHierarchy(
    decks: EchoeDeckWithCountsDto[],
    directRetrievabilityEligibleCountMap: Map<string, number>
  ): EchoeDeckWithCountsDto[] {
    const deckMap = new Map<string, EchoeDeckWithCountsDto>();
    const rootDecks: EchoeDeckWithCountsDto[] = [];

    // First pass: create map
    for (const deck of decks) {
      deckMap.set(deck.deckId, { ...deck, children: [] });
    }

    // Second pass: build hierarchy
    for (const deck of decks) {
      if (deck.name.includes('::')) {
        const parentName = deck.name.substring(0, deck.name.lastIndexOf('::'));
        const parent = decks.find((d) => d.name === parentName);
        if (parent) {
          const parentDeck = deckMap.get(parent.deckId);
          if (parentDeck) {
            parentDeck.children.push(deckMap.get(deck.deckId)!);
          }
        } else {
          // Parent doesn't exist, treat as root
          rootDecks.push(deckMap.get(deck.deckId)!);
        }
      } else {
        rootDecks.push(deckMap.get(deck.deckId)!);
      }
    }

    // Third pass: aggregate stats from children to parents (post-order traversal)
    for (const root of rootDecks) {
      this.aggregateChildStats(root, directRetrievabilityEligibleCountMap);
    }

    return rootDecks.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Recursively aggregate stats from child decks to parent
   * - newCount, learnCount, reviewCount: sum of direct + children
   * - totalCount, matureCount, difficultCount: sum of direct + children
   * - averageRetrievability: weighted average by retrievability-eligible cards
   * - lastStudiedAt: max of self and children
   *
   * Returns the total retrievability-eligible card count for this subtree.
   */
  private aggregateChildStats(
    deck: EchoeDeckWithCountsDto,
    directRetrievabilityEligibleCountMap: Map<string, number>
  ): number {
    let totalNewCount = deck.newCount;
    let totalLearnCount = deck.learnCount;
    let totalReviewCount = deck.reviewCount;
    let totalTotalCount = deck.totalCount;
    let totalMatureCount = deck.matureCount;
    let totalDifficultCount = deck.difficultCount;
    let totalRetrievabilityEligibleCount = directRetrievabilityEligibleCountMap.get(deck.deckId) || 0;
    let totalRetrievabilitySum = deck.averageRetrievability * totalRetrievabilityEligibleCount;
    let maxLastStudiedAt = deck.lastStudiedAt;

    for (const child of deck.children) {
      const childRetrievabilityEligibleCount = this.aggregateChildStats(child, directRetrievabilityEligibleCountMap);
      totalNewCount += child.newCount;
      totalLearnCount += child.learnCount;
      totalReviewCount += child.reviewCount;
      totalTotalCount += child.totalCount;
      totalMatureCount += child.matureCount;
      totalDifficultCount += child.difficultCount;
      totalRetrievabilityEligibleCount += childRetrievabilityEligibleCount;
      totalRetrievabilitySum += child.averageRetrievability * childRetrievabilityEligibleCount;
      if (child.lastStudiedAt !== null && (maxLastStudiedAt === null || child.lastStudiedAt > maxLastStudiedAt)) {
        maxLastStudiedAt = child.lastStudiedAt;
      }
    }

    deck.newCount = totalNewCount;
    deck.learnCount = totalLearnCount;
    deck.reviewCount = totalReviewCount;
    deck.totalCount = totalTotalCount;
    deck.matureCount = totalMatureCount;
    deck.difficultCount = totalDifficultCount;
    deck.averageRetrievability =
      totalRetrievabilityEligibleCount > 0 ? totalRetrievabilitySum / totalRetrievabilityEligibleCount : 0;
    deck.lastStudiedAt = maxLastStudiedAt;

    return totalRetrievabilityEligibleCount;
  }

  /**
   * Get a single deck by ID
   */
  async getDeckById(uid: string, id: string): Promise<EchoeDeckWithCountsDto | null> {
    const db = getDatabase();

    const deck = await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, id))).limit(1);

    if (deck.length === 0) {
      return null;
    }

    const nowMs = Date.now();

    const counts = await db
      .select({
        did: echoeCards.did,
        newCount: sql<number>`SUM(CASE WHEN ${echoeCards.queue} = 0 THEN 1 ELSE 0 END)`,
        learnCount: sql<number>`SUM(CASE WHEN ${echoeCards.queue} IN (1, 3) THEN 1 ELSE 0 END)`,
        reviewCount: sql<number>`SUM(CASE WHEN ${echoeCards.queue} = 2 AND ${echoeCards.due} <= ${nowMs} THEN 1 ELSE 0 END)`,
      })
      .from(echoeCards)
      .where(and(eq(echoeCards.uid, uid), eq(echoeCards.did, id)))
      .groupBy(echoeCards.did);

    // Get FSRS stats for this deck
    const now = Date.now();
    const retrievabilityExpr = getRetrievabilitySqlExpr(now, echoeCards.lastReview, echoeCards.stability);
    const fsrsStats = await db
      .select({
        did: echoeCards.did,
        totalCount: sql<number>`COUNT(*)`,
        matureCount: sql<number>`SUM(CASE WHEN ${echoeCards.stability} >= 21 THEN 1 ELSE 0 END)`,
        difficultCount: sql<number>`SUM(CASE WHEN ${echoeCards.lastReview} > 0 AND ${echoeCards.stability} > 0 AND (${now} - ${echoeCards.lastReview}) > (${echoeCards.stability} * ${DAY_MS}) THEN 1 ELSE 0 END)`,
        retrievabilityEligibleCount: sql<number>`SUM(CASE WHEN ${retrievabilityExpr} IS NULL THEN 0 ELSE 1 END)`,
        averageRetrievability: sql<number>`AVG(${retrievabilityExpr})`,
        lastStudiedAt: sql<number>`MAX(CASE WHEN ${echoeCards.lastReview} > 0 THEN ${echoeCards.lastReview} ELSE NULL END)`,
      })
      .from(echoeCards)
      .where(and(eq(echoeCards.uid, uid), eq(echoeCards.did, id)))
      .groupBy(echoeCards.did);

    const count = counts[0] || { newCount: 0, learnCount: 0, reviewCount: 0 };
    const fsrs = fsrsStats[0] || {
      totalCount: 0,
      matureCount: 0,
      difficultCount: 0,
      retrievabilityEligibleCount: 0,
      averageRetrievability: 0,
      lastStudiedAt: null,
    };

    return {
      // Semantic business ID fields (preferred)
      deckId: deck[0].deckId,
      // @deprecated alias - retained for backwards compatibility
      id: deck[0].deckId,
      name: deck[0].name,
      conf: deck[0].conf,
      extendNew: deck[0].extendNew,
      extendRev: deck[0].extendRev,
      collapsed: deck[0].collapsed === 1,
      dyn: deck[0].dyn,
      desc: deck[0].desc || '',
      mid: deck[0].mid ?? '',
      mod: deck[0].mod,
      newCount: Number(count.newCount) || 0,
      learnCount: Number(count.learnCount) || 0,
      reviewCount: Number(count.reviewCount) || 0,
      totalCount: Number(fsrs.totalCount) || 0,
      matureCount: Number(fsrs.matureCount) || 0,
      difficultCount: Number(fsrs.difficultCount) || 0,
      averageRetrievability: Number(fsrs.averageRetrievability) || 0,
      lastStudiedAt: fsrs.lastStudiedAt ? Number(fsrs.lastStudiedAt) : null,
      children: [],
    };
  }

  /**
   * Create a new deck
   */
  async createDeck(uid: string, dto: CreateEchoeDeckDto): Promise<EchoeDeckWithCountsDto> {
    const db = getDatabase();

    // Generate deck business ID
    const deckId = generateTypeId(OBJECT_TYPE.ECHOE_DECK);
    const now = Math.floor(Date.now() / 1000);

    // If name contains '::', check if parent exists (not for filtered decks)
    if (!dto.dyn && dto.name.includes('::')) {
      const parentName = dto.name.substring(0, dto.name.lastIndexOf('::'));
      const parent = await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.name, parentName))).limit(1);
      if (parent.length === 0) {
        throw new Error(`Parent deck '${parentName}' does not exist`);
      }
    }

    // Determine if this is a filtered deck
    const isFiltered = dto.dyn === true;
    const dyn = isFiltered ? 1 : 0;
    const desc = isFiltered ? `Search: ${dto.searchQuery || ''}` : (dto.desc || '');

    const newDeck: NewEchoeDecks = {
      deckId: deckId,
      uid,
      name: dto.name,
      conf: dto.conf || '',
      extendNew: 20,
      extendRev: 200,
      usn: 0,
      lim: 0,
      collapsed: 0,
      dyn,
      mod: now,
      desc,
      mid: null,
    };

    await db.insert(echoeDecks).values(newDeck);

    // If this is a filtered deck and has a search query, build it
    if (isFiltered && dto.searchQuery) {
      await this.buildFilteredDeck(uid, deckId, dto.searchQuery, false);
    }

    return {
      // Semantic business ID fields (preferred)
      deckId: newDeck.deckId,
      // @deprecated alias - retained for backwards compatibility
      id: newDeck.deckId,
      name: newDeck.name,
      conf: newDeck.conf || '',
      extendNew: newDeck.extendNew ?? 20,
      extendRev: newDeck.extendRev ?? 200,
      collapsed: false,
      dyn: newDeck.dyn ?? 0,
      desc: newDeck.desc || '',
      mid: newDeck.mid || '',
      mod: newDeck.mod,
      newCount: 0,
      learnCount: 0,
      reviewCount: 0,
      totalCount: 0,
      matureCount: 0,
      difficultCount: 0,
      averageRetrievability: 0,
      lastStudiedAt: null,
      children: [],
    };
  }

  /**
   * Update a deck
   */
  async updateDeck(uid: string, id: string, dto: UpdateEchoeDeckDto): Promise<EchoeDeckWithCountsDto | null> {
    const db = getDatabase();

    const deck = await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, id))).limit(1);

    if (deck.length === 0) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const updates: Partial<EchoeDecks> = {
      mod: now,
      usn: 0,
    };

    if (dto.name !== undefined) {
      // Check if new parent exists if using ::
      if (dto.name.includes('::')) {
        const parentName = dto.name.substring(0, dto.name.lastIndexOf('::'));
        const parent = await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.name, parentName))).limit(1);
        if (parent.length === 0) {
          throw new Error(`Parent deck '${parentName}' does not exist`);
        }
      }
      updates.name = dto.name;
    }

    if (dto.desc !== undefined) {
      updates.desc = dto.desc;
    }

    await db.update(echoeDecks).set(updates).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, id)));

    return this.getDeckById(uid, id);
  }

  /**
   * Delete a deck
   */
  async deleteDeck(uid: string, id: string, deleteCards: boolean = false): Promise<boolean> {
    const db = getDatabase();

    const deck = await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, id))).limit(1);

    if (deck.length === 0) {
      return false;
    }

    // Pre-fetch data needed inside the transaction to minimize read locks
    let deckIds: string[] = [];
    let noteIds: string[] = [];

    if (deleteCards) {
      deckIds = await this.getDeckAndSubdeckIds(uid, id);
      const cards = await db.select({ nid: echoeCards.nid }).from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.did, deckIds)));
      noteIds = Array.from(new Set(cards.map((c: Pick<EchoeCards, 'nid'>) => c.nid)));
    }

    // Wrap all mutation operations in a transaction to prevent partial-delete state
    return withTransaction(async (tx) => {
      const now = Math.floor(Date.now() / 1000);

      if (deleteCards) {
        if (noteIds.length > 0) {
          // Add notes to graves
          for (const nid of noteIds) {
            await tx.insert(echoeGraves).values({ graveId: generateTypeId(OBJECT_TYPE.ECHOE_GRAVE), uid, usn: 0, oid: nid, type: 1 });
          }

          // Delete cards
          await tx.delete(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.did, deckIds)));

          // Delete notes
          await tx.delete(echoeNotes).where(and(eq(echoeNotes.uid, uid), inArray(echoeNotes.noteId, noteIds)));
        }

        // Delete sub-decks
        await tx.delete(echoeDecks).where(and(eq(echoeDecks.uid, uid), inArray(echoeDecks.deckId, deckIds.slice(1))));
      }

      // Add deck to graves
      await tx.insert(echoeGraves).values({ graveId: generateTypeId(OBJECT_TYPE.ECHOE_GRAVE), uid, usn: 0, oid: id, type: 0 });

      // Delete deck
      await tx.delete(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, id)));

      return true;
    });
  }

  /**
   * Get deck and all sub-deck IDs
   */
  async getDeckAndSubdeckIds(uid: string, id: string): Promise<string[]> {
    const db = getDatabase();

    const deck = await db
      .select({ name: echoeDecks.name })
      .from(echoeDecks)
      .where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, id)))
      .limit(1);

    if (deck.length === 0) {
      return [];
    }

    const result: string[] = [id];
    const subDecks = await db
      .select({ deckId: echoeDecks.deckId })
      .from(echoeDecks)
      .where(and(eq(echoeDecks.uid, uid), like(echoeDecks.name, `${deck[0].name}::%`)));

    for (const subDeck of subDecks) {
      result.push(subDeck.deckId);
    }

    return result;
  }

  /**
   * Get deck config by deck ID
   */
  async getDeckConfig(uid: string, deckId: string): Promise<EchoeDeckConfigDto | null> {
    const db = getDatabase();

    const deck = await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, deckId))).limit(1);

    if (deck.length === 0) {
      return null;
    }

    const config = await db.select().from(echoeDeckConfig).where(and(eq(echoeDeckConfig.uid, uid), eq(echoeDeckConfig.deckConfigId, deck[0].conf))).limit(1);

    if (config.length === 0) {
      return null;
    }

    return this.mapConfigToDto(config[0]);
  }

  /**
   * Update deck config
   */
  async updateDeckConfig(uid: string, deckId: string, dto: UpdateEchoeDeckConfigDto): Promise<EchoeDeckConfigDto | null> {
    const db = getDatabase();

    const deck = await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, deckId))).limit(1);

    if (deck.length === 0) {
      return null;
    }

    const config = await db.select().from(echoeDeckConfig).where(and(eq(echoeDeckConfig.uid, uid), eq(echoeDeckConfig.deckConfigId, deck[0].conf))).limit(1);

    if (config.length === 0) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    const updates: Partial<EchoeDeckConfig> = {
      mod: now,
      usn: 0,
    };

    const currentNewConfig = this.safeParseConfigObject(config[0].newConfig);
    const currentRevConfig = this.safeParseConfigObject(config[0].revConfig);
    const currentLapseConfig = this.safeParseConfigObject(config[0].lapseConfig);

    if (dto.name !== undefined) {
      updates.name = dto.name;
    }
    if (dto.replayq !== undefined) {
      updates.replayq = dto.replayq ? 1 : 0;
    }
    if (dto.timer !== undefined) {
      updates.timer = dto.timer;
    }
    if (dto.maxTaken !== undefined) {
      updates.maxTaken = dto.maxTaken;
    }
    if (dto.autoplay !== undefined) {
      // Convert string to integer: 'never'=0, 'front'=1, 'back'=2, 'both'=3
      const autoplayMap: Record<string, number> = { never: 0, front: 1, back: 2, both: 3 };
      updates.autoplay = autoplayMap[dto.autoplay] ?? 3;
    }
    if (dto.ttsSpeed !== undefined) {
      // Convert speed (0.5-2.0) to tinyint (0-4)
      const speed = Math.max(0.5, Math.min(2.0, dto.ttsSpeed));
      updates.ttsSpeed = Math.round(speed * 2);
    }
    if (dto.newConfig !== undefined) {
      updates.newConfig = JSON.stringify({ ...currentNewConfig, ...dto.newConfig });
    }

    let nextRevConfig: Record<string, unknown> | null = null;
    if (dto.revConfig !== undefined) {
      nextRevConfig = { ...currentRevConfig, ...dto.revConfig };
    }
    if (dto.fsrsConfig !== undefined) {
      const revConfigForFsrs = nextRevConfig ?? { ...currentRevConfig };
      const currentFsrsConfig = this.asRecord(revConfigForFsrs.fsrs);
      revConfigForFsrs.fsrs = {
        ...currentFsrsConfig,
        ...dto.fsrsConfig,
      };
      nextRevConfig = revConfigForFsrs;
    }
    if (nextRevConfig) {
      updates.revConfig = JSON.stringify(nextRevConfig);
    }

    if (dto.lapseConfig !== undefined) {
      updates.lapseConfig = JSON.stringify({ ...currentLapseConfig, ...dto.lapseConfig });
    }

    await db.update(echoeDeckConfig).set(updates).where(and(eq(echoeDeckConfig.uid, uid), eq(echoeDeckConfig.deckConfigId, deck[0].conf)));

    const updated = await db.select().from(echoeDeckConfig).where(and(eq(echoeDeckConfig.uid, uid), eq(echoeDeckConfig.deckConfigId, deck[0].conf))).limit(1);

    return this.mapConfigToDto(updated[0]);
  }

  /**
   * Map database config to DTO
   */
  private mapConfigToDto(config: EchoeDeckConfig): EchoeDeckConfigDto {
    // Convert integer to string: 0='never', 1='front', 2='back', 3='both'
    const autoplayMap = ['never', 'front', 'back', 'both'];
    const autoplayStr = autoplayMap[config.autoplay] ?? 'both';

    // Convert tinyint (0-4) to speed (0.5-2.0)
    const ttsSpeed = config.ttsSpeed ? config.ttsSpeed / 2 : 1;

    const newConfig = this.safeParseConfigObject(config.newConfig);
    const revConfig = this.safeParseConfigObject(config.revConfig);
    const lapseConfig = this.safeParseConfigObject(config.lapseConfig);

    return {
      id: config.deckConfigId,
      name: config.name,
      replayq: config.replayq === 1,
      timer: config.timer,
      maxTaken: config.maxTaken,
      autoplay: autoplayStr,
      ttsSpeed,
      mod: config.mod,
      newConfig: newConfig as unknown as EchoeNewCardConfigDto,
      revConfig: revConfig as unknown as EchoeReviewConfigDto,
      lapseConfig: lapseConfig as unknown as EchoeLapseConfigDto,
      fsrsConfig: this.extractFsrsConfig(newConfig, revConfig, lapseConfig),
    };
  }

  private safeParseConfigObject(json: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(json) as unknown;
      return this.asRecord(parsed);
    } catch {
      return {};
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private parseNumeric(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    return undefined;
  }

  private parseBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private normalizeSteps(value: unknown): number[] | undefined {
    if (!Array.isArray(value) || value.length === 0) {
      return undefined;
    }

    const steps: number[] = [];
    for (const step of value) {
      const minutes = parseStepToMinutes(step);
      if (minutes === undefined) {
        return undefined;
      }
      steps.push(minutes);
    }

    return steps;
  }

  private parseRequestRetention(value: unknown): number | undefined {
    const numeric = this.parseNumeric(value);
    if (numeric === undefined || numeric < 0.7 || numeric > 0.99) {
      return undefined;
    }

    return Math.round(numeric * 10000) / 10000;
  }

  private parseMaxInterval(value: unknown): number | undefined {
    const numeric = this.parseNumeric(value);
    if (numeric === undefined) {
      return undefined;
    }

    const normalized = Math.floor(numeric);
    if (normalized < 1 || normalized > 36500) {
      return undefined;
    }

    return normalized;
  }

  private extractFsrsConfig(
    newConfig: Record<string, unknown>,
    revConfig: Record<string, unknown>,
    lapseConfig: Record<string, unknown>
  ): EchoeFsrsConfigDto {
    const rawFsrs = this.asRecord(revConfig.fsrs);

    const requestRetention = this.parseRequestRetention(rawFsrs.requestRetention)
      ?? DEFAULT_FSRS_DTO_CONFIG.requestRetention;
    const maxInterval = this.parseMaxInterval(rawFsrs.maxInterval)
      ?? this.parseMaxInterval(revConfig.maxInterval)
      ?? DEFAULT_FSRS_DTO_CONFIG.maxInterval;
    const enableFuzz = this.parseBoolean(rawFsrs.enableFuzz) ?? DEFAULT_FSRS_DTO_CONFIG.enableFuzz;
    const enableShortTerm = this.parseBoolean(rawFsrs.enableShortTerm) ?? DEFAULT_FSRS_DTO_CONFIG.enableShortTerm;
    const learningSteps = this.normalizeSteps(rawFsrs.learningSteps)
      ?? this.normalizeSteps(newConfig.steps)
      ?? this.normalizeSteps(newConfig.delays)
      ?? this.normalizeSteps(newConfig.newSteps)
      ?? DEFAULT_FSRS_DTO_CONFIG.learningSteps;
    const relearningSteps = this.normalizeSteps(rawFsrs.relearningSteps)
      ?? this.normalizeSteps(lapseConfig.steps)
      ?? this.normalizeSteps(lapseConfig.delays)
      ?? DEFAULT_FSRS_DTO_CONFIG.relearningSteps;

    return {
      requestRetention,
      maxInterval,
      enableFuzz,
      enableShortTerm,
      learningSteps: [...learningSteps],
      relearningSteps: [...relearningSteps],
    };
  }

  /**
   * Create a filtered deck
   */
  async createFilteredDeck(uid: string, dto: CreateFilteredDeckDto, buildNow: boolean = true): Promise<EchoeDeckWithCountsDto> {
    const db = getDatabase();

    // Generate deck business ID
    const deckId = generateTypeId(OBJECT_TYPE.ECHOE_DECK);
    const now = Math.floor(Date.now() / 1000);

    const newDeck: NewEchoeDecks = {
      deckId: deckId,
      uid,
      name: dto.name,
      conf: '',
      extendNew: 20,
      extendRev: 200,
      usn: 0,
      lim: 0,
      collapsed: 0,
      dyn: 1, // 1 = filtered deck
      mod: now,
      desc: `Search: ${dto.searchQuery}`,
      mid: null,
    };

    await db.insert(echoeDecks).values(newDeck);

    if (buildNow) {
      await this.buildFilteredDeck(uid, deckId, dto.searchQuery, dto.rebuildDaily ?? false);
    }

    return this.getDeckById(uid, deckId) as Promise<EchoeDeckWithCountsDto>;
  }

  /**
   * Rebuild a filtered deck by running the search query
   */
  async rebuildFilteredDeck(uid: string, deckId: string): Promise<boolean> {
    const db = getDatabase();

    // Get deck info
    const deck = await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, deckId))).limit(1);

    if (deck.length === 0 || deck[0].dyn !== 1) {
      return false;
    }

    // Extract search query from description (format: "Search: <query>")
    const searchQuery = deck[0].desc?.replace(/^Search: /, '') || '';
    const rebuildDaily = deck[0].extendNew > 0; // Use extendNew as rebuildDaily flag

    // First, empty current filtered cards back to their original decks
    await this.emptyFilteredDeck(uid, deckId);

    // Then rebuild with new cards
    await this.buildFilteredDeck(uid, deckId, searchQuery, rebuildDaily);

    return true;
  }

  /**
   * Empty a filtered deck - return cards to their original decks
   */
  async emptyFilteredDeck(uid: string, deckId: string): Promise<boolean> {
    const db = getDatabase();

    // Get deck info
    const deck = await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), eq(echoeDecks.deckId, deckId))).limit(1);

    if (deck.length === 0 || deck[0].dyn !== 1) {
      return false;
    }

    // Find cards in this filtered deck that have odid set (original deck)
    const cards = await db
      .select()
      .from(echoeCards)
      .where(and(eq(echoeCards.uid, uid), eq(echoeCards.did, deckId), sql`${echoeCards.odid} IS NOT NULL AND ${echoeCards.odid} != ''`));

    if (cards.length === 0) {
      return true;
    }

    // Move cards back to their original deck
    const now = Math.floor(Date.now() / 1000);
    for (const card of cards) {
      await db
        .update(echoeCards)
        .set({
          did: card.odid,
          odid: '',
          odue: 0,
          mod: now,
          usn: 0,
        })
        .where(and(eq(echoeCards.uid, uid), eq(echoeCards.cardId, card.cardId)));
    }

    return true;
  }

  /**
   * Preview a filtered deck - show sample cards without modifying data
   */
  async previewFilteredDeck(uid: string, searchQuery: string, limit: number = 5): Promise<FilteredDeckPreviewDto> {
    const db = getDatabase();
    const cards = await this.findCardsBySearch(uid, searchQuery, limit);

    // Map to DTO format
    const sampleCards: EchoeCardListItemDto[] = await Promise.all(
      cards.map(async (card) => {
        // Get note info
        const note = await db.select().from(echoeNotes).where(and(eq(echoeNotes.noteId, card.nid), eq(echoeNotes.uid, uid))).limit(1);
        const noteData = note[0];

        // Get deck name
        const deck = await db.select().from(echoeDecks).where(and(eq(echoeDecks.deckId, card.did), eq(echoeDecks.uid, uid))).limit(1);

        // Get note type name
        const noteType = noteData?.mid
          ? await db.select().from(echoeNotetypes).where(and(eq(echoeNotetypes.noteTypeId, noteData.mid), eq(echoeNotetypes.uid, uid))).limit(1)
          : [];

        // Parse fields from fieldsJson (primary source)
        const fields: Record<string, string> =
          noteData?.fieldsJson && typeof noteData.fieldsJson === 'object' && Object.keys(noteData.fieldsJson).length > 0
            ? (noteData.fieldsJson as Record<string, string>)
            : {};
        const front = fields['Front'] || fields['front'] || Object.values(fields)[0] || '';

        return {
          // Semantic business ID fields (preferred)
          cardId: card.cardId,
          noteId: card.nid,
          deckId: card.did,
          // @deprecated aliases - retained for backwards compatibility
          id: card.cardId,
          nid: card.nid,
          did: card.did,
          deckName: deck[0]?.name || 'Unknown',
          ord: card.ord,
          type: card.type,
          queue: card.queue,
          due: Number(card.due),
          ivl: card.ivl,
          factor: card.factor,
          reps: card.reps,
          lapses: card.lapses,
          front,
          fields,
          tags: noteData?.tags || [],
          mid: noteData?.mid || '',
          notetypeName: noteType[0]?.name || 'Unknown',
          addedAt: card.mod * 1000,
          mod: card.mod,
          notetypeType: noteType[0]?.type || 0,
        };
      })
    );

    return {
      count: cards.length,
      sampleCards,
    };
  }

  /**
   * Build filtered deck - find cards matching search and move to filtered deck
   */
  private async buildFilteredDeck(uid: string, deckId: string, searchQuery: string, rebuildDaily: boolean): Promise<void> {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    // Find cards matching search
    const cards = await this.findCardsBySearch(uid, searchQuery, 10000); // Limit to 10000 cards

    if (cards.length === 0) {
      return;
    }

    // Move cards to filtered deck
    for (const card of cards) {
      // Store original deck and due in odid/odue
      await db
        .update(echoeCards)
        .set({
          did: deckId,
          odid: card.did,
          odue: card.due,
          mod: now,
          usn: 0,
        })
        .where(and(eq(echoeCards.uid, uid), eq(echoeCards.cardId, card.cardId)));
    }
  }

  /**
   * Find cards by search query
   */
  private async findCardsBySearch(uid: string, searchQuery: string, limit: number = 1000): Promise<any[]> {
    const db = getDatabase();
    const nowMs = Date.now();

    // Simple search parser - handles common search terms
    // Supports: deck:*, tag:*, is:new, is:learn, is:review, is:suspended, is:buried, note:*, "text"
    const terms = searchQuery.toLowerCase().split(/\s+/);
    let conditions: any[] = [];

    for (const term of terms) {
      if (term.startsWith('deck:')) {
        // Filter by deck name
        const deckName = term.substring(5).replace(/"/g, '');
        const decks = await db.select().from(echoeDecks).where(and(eq(echoeDecks.uid, uid), sql`${echoeDecks.name} LIKE ${`%${deckName}%`}`));
        const deckIds = decks.map((d: Pick<EchoeDecks, 'deckId'>) => d.deckId);
        if (deckIds.length > 0) {
          conditions.push(inArray(echoeCards.did, deckIds));
        }
      } else if (term.startsWith('tag:')) {
        // Filter by tag
        const tag = term.substring(4).replace(/"/g, '');
        const notes = await db.select({ noteId: echoeNotes.noteId }).from(echoeNotes).where(and(eq(echoeNotes.uid, uid), sql`${echoeNotes.tags} LIKE ${`%"${tag}"%`}`));
        const noteIds = notes.map((n: Pick<EchoeNotes, 'noteId'>) => n.noteId);
        if (noteIds.length > 0) {
          conditions.push(inArray(echoeNotes.noteId, noteIds));
        } else {
          return []; // No notes with this tag
        }
      } else if (term === 'is:new') {
        // New cards
        conditions.push(eq(echoeCards.queue, 0));
      } else if (term === 'is:learn' || term === 'is:learning') {
        // Learning cards
        conditions.push(sql`${echoeCards.queue} IN (1, 3)`);
      } else if (term === 'is:review') {
        // Review cards due
        conditions.push(and(eq(echoeCards.queue, 2), sql`${echoeCards.due} <= ${nowMs}`));
      } else if (term === 'is:suspended') {
        // Suspended cards
        conditions.push(eq(echoeCards.queue, -1));
      } else if (term === 'is:buried') {
        // Buried cards
        conditions.push(sql`${echoeCards.queue} IN (-2, -3)`);
      } else if (term.startsWith('note:')) {
        // Filter by note type
        const noteTypeName = term.substring(5).replace(/"/g, '');
        // Get notetype by name - need to query notetypes table
        // For now, skip this if not implemented
      } else if (term.startsWith('front:') || term.startsWith('back:')) {
        // Filter by field content
        const fieldSearch = term.substring(term.indexOf(':') + 1).replace(/"/g, '');
        const notes = await db
          .select({ noteId: echoeNotes.noteId })
          .from(echoeNotes)
          .where(and(eq(echoeNotes.uid, uid), sql`${echoeNotes.sfld} LIKE ${`%${fieldSearch}%`}`));
        const noteIds = notes.map((n: Pick<EchoeNotes, 'noteId'>) => n.noteId);
        if (noteIds.length > 0) {
          conditions.push(inArray(echoeNotes.noteId, noteIds));
        } else {
          return [];
        }
      } else if (term.startsWith('"') && term.endsWith('"')) {
        // Quoted string - search in sfld
        const text = term.replace(/"/g, '');
        const notes = await db
          .select({ noteId: echoeNotes.noteId })
          .from(echoeNotes)
          .where(and(eq(echoeNotes.uid, uid), sql`${echoeNotes.sfld} LIKE ${`%${text}%`}`));
        const noteIds = notes.map((n: Pick<EchoeNotes, 'noteId'>) => n.noteId);
        if (noteIds.length > 0) {
          conditions.push(inArray(echoeNotes.noteId, noteIds));
        } else {
          return [];
        }
      }
    }

    // Get all cards
    let cards;
    if (conditions.length > 0) {
      // Join with notes table if we have note-based conditions
      const hasNoteCondition = conditions.some((c) => c && typeof c === 'object' && 'constructor' in c);
      if (hasNoteCondition || searchQuery.includes('tag:') || searchQuery.includes('front:') || searchQuery.includes('back:') || searchQuery.includes('"')) {
        // Get note IDs from conditions
        let noteIds: string[] = [];
        for (const cond of conditions) {
          if (cond && typeof cond === 'object' && 'constructor' in cond) {
            const notes = await db.select({ noteId: echoeNotes.noteId }).from(echoeNotes).where(cond);
            noteIds = [...noteIds, ...notes.map((n: Pick<EchoeNotes, 'noteId'>) => n.noteId)];
          }
        }
        // Remove duplicates
        noteIds = [...new Set(noteIds)];

        if (noteIds.length === 0) {
          return [];
        }

        // Get cards for these notes
        const cardRecords = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), inArray(echoeCards.nid, noteIds)));
        cards = cardRecords;
      } else {
        // Direct card conditions
        cards = await db.select().from(echoeCards).where(and(eq(echoeCards.uid, uid), ...conditions));
      }
    } else {
      // No conditions - return all cards (limited)
      cards = await db.select().from(echoeCards).where(eq(echoeCards.uid, uid)).limit(limit);
    }

    return cards.slice(0, limit);
  }
}
