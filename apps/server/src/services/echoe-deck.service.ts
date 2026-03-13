import { Service } from 'typedi';
import { eq, and, inArray, like, sql } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';
import { echoeDeckConfig } from '../db/schema/echoe-deck-config.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeNotetypes } from '../db/schema/echoe-notetypes.js';
import { echoeGraves } from '../db/schema/echoe-graves.js';
import { logger } from '../utils/logger.js';
import { DAY_MS, getRetrievabilitySqlExpr } from '../utils/fsrs-retrievability.js';
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
  async getAllDecks(): Promise<EchoeDeckWithCountsDto[]> {
    const db = getDatabase();

    // Get all decks
    const decks = await db.select().from(echoeDecks).orderBy(echoeDecks.name);

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
      .groupBy(echoeCards.did);

    // Create maps for quick lookup
    const countsMap = new Map<number, { newCount: number; learnCount: number; reviewCount: number }>();
    for (const card of cardsWithCounts) {
      countsMap.set(Number(card.did), {
        newCount: Number(card.newCount) || 0,
        learnCount: Number(card.learnCount) || 0,
        reviewCount: Number(card.reviewCount) || 0,
      });
    }

    const fsrsMap = new Map<
      number,
      {
        totalCount: number;
        matureCount: number;
        difficultCount: number;
        averageRetrievability: number;
        lastStudiedAt: number | null;
      }
    >();
    const retrievabilityEligibleCountMap = new Map<number, number>();
    for (const card of cardsWithFsrsStats) {
      const did = Number(card.did);
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
    const decksWithCounts: EchoeDeckWithCountsDto[] = decks.map((deck: EchoeDecks) => {
      const counts = countsMap.get(Number(deck.id)) || { newCount: 0, learnCount: 0, reviewCount: 0 };
      const fsrs = fsrsMap.get(Number(deck.id)) || {
        totalCount: 0,
        matureCount: 0,
        difficultCount: 0,
        averageRetrievability: 0,
        lastStudiedAt: null,
      };
      return {
        id: Number(deck.id),
        name: deck.name,
        conf: Number(deck.conf),
        extendNew: deck.extendNew,
        extendRev: deck.extendRev,
        collapsed: deck.collapsed === 1,
        dyn: deck.dyn,
        desc: deck.desc || '',
        mid: Number(deck.mid),
        mod: deck.mod,
        newCount: counts.newCount,
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
   * Build deck hierarchy from flat list with aggregated stats from child decks
   */
  private buildDeckHierarchy(
    decks: EchoeDeckWithCountsDto[],
    directRetrievabilityEligibleCountMap: Map<number, number>
  ): EchoeDeckWithCountsDto[] {
    const deckMap = new Map<number, EchoeDeckWithCountsDto>();
    const rootDecks: EchoeDeckWithCountsDto[] = [];

    // First pass: create map
    for (const deck of decks) {
      deckMap.set(deck.id, { ...deck, children: [] });
    }

    // Second pass: build hierarchy
    for (const deck of decks) {
      if (deck.name.includes('::')) {
        const parentName = deck.name.substring(0, deck.name.lastIndexOf('::'));
        const parent = decks.find((d) => d.name === parentName);
        if (parent) {
          const parentDeck = deckMap.get(parent.id);
          if (parentDeck) {
            parentDeck.children.push(deckMap.get(deck.id)!);
          }
        } else {
          // Parent doesn't exist, treat as root
          rootDecks.push(deckMap.get(deck.id)!);
        }
      } else {
        rootDecks.push(deckMap.get(deck.id)!);
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
    directRetrievabilityEligibleCountMap: Map<number, number>
  ): number {
    let totalNewCount = deck.newCount;
    let totalLearnCount = deck.learnCount;
    let totalReviewCount = deck.reviewCount;
    let totalTotalCount = deck.totalCount;
    let totalMatureCount = deck.matureCount;
    let totalDifficultCount = deck.difficultCount;
    let totalRetrievabilityEligibleCount = directRetrievabilityEligibleCountMap.get(deck.id) || 0;
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
  async getDeckById(id: number): Promise<EchoeDeckWithCountsDto | null> {
    const db = getDatabase();

    const deck = await db.select().from(echoeDecks).where(eq(echoeDecks.id, id)).limit(1);

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
      .where(eq(echoeCards.did, id))
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
      .where(eq(echoeCards.did, id))
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
      id: Number(deck[0].id),
      name: deck[0].name,
      conf: Number(deck[0].conf),
      extendNew: deck[0].extendNew,
      extendRev: deck[0].extendRev,
      collapsed: deck[0].collapsed === 1,
      dyn: deck[0].dyn,
      desc: deck[0].desc || '',
      mid: Number(deck[0].mid),
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
  async createDeck(dto: CreateEchoeDeckDto): Promise<EchoeDeckWithCountsDto> {
    const db = getDatabase();

    // Generate deck ID (Unix timestamp in ms)
    const id = Date.now();
    const now = Math.floor(Date.now() / 1000);

    // If name contains '::', check if parent exists (not for filtered decks)
    if (!dto.dyn && dto.name.includes('::')) {
      const parentName = dto.name.substring(0, dto.name.lastIndexOf('::'));
      const parent = await db.select().from(echoeDecks).where(eq(echoeDecks.name, parentName)).limit(1);
      if (parent.length === 0) {
        throw new Error(`Parent deck '${parentName}' does not exist`);
      }
    }

    // Determine if this is a filtered deck
    const isFiltered = dto.dyn === true;
    const dyn = isFiltered ? 1 : 0;
    const desc = isFiltered ? `Search: ${dto.searchQuery || ''}` : (dto.desc || '');

    const newDeck: NewEchoeDecks = {
      id: id,
      name: dto.name,
      conf: dto.conf || 1,
      extendNew: 20,
      extendRev: 200,
      usn: 0,
      lim: 0,
      collapsed: 0,
      dyn,
      mod: now,
      desc,
      mid: 0,
    };

    await db.insert(echoeDecks).values(newDeck);

    // If this is a filtered deck and has a search query, build it
    if (isFiltered && dto.searchQuery) {
      await this.buildFilteredDeck(id, dto.searchQuery, false);
    }

    return {
      id: newDeck.id,
      name: newDeck.name,
      conf: newDeck.conf ?? 1,
      extendNew: newDeck.extendNew ?? 20,
      extendRev: newDeck.extendRev ?? 200,
      collapsed: false,
      dyn: newDeck.dyn ?? 0,
      desc: newDeck.desc || '',
      mid: newDeck.mid ?? 0,
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
  async updateDeck(id: number, dto: UpdateEchoeDeckDto): Promise<EchoeDeckWithCountsDto | null> {
    const db = getDatabase();

    const deck = await db.select().from(echoeDecks).where(eq(echoeDecks.id, id)).limit(1);

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
        const parent = await db.select().from(echoeDecks).where(eq(echoeDecks.name, parentName)).limit(1);
        if (parent.length === 0) {
          throw new Error(`Parent deck '${parentName}' does not exist`);
        }
      }
      updates.name = dto.name;
    }

    if (dto.desc !== undefined) {
      updates.desc = dto.desc;
    }

    await db.update(echoeDecks).set(updates).where(eq(echoeDecks.id, id));

    return this.getDeckById(id);
  }

  /**
   * Delete a deck
   */
  async deleteDeck(id: number, deleteCards: boolean = false): Promise<boolean> {
    const db = getDatabase();

    const deck = await db.select().from(echoeDecks).where(eq(echoeDecks.id, id)).limit(1);

    if (deck.length === 0) {
      return false;
    }

    if (deleteCards) {
      // Delete all cards in this deck and sub-decks
      const deckIds = await this.getDeckAndSubdeckIds(id);

      // Find notes in these decks
      const cards = await db.select({ nid: echoeCards.nid }).from(echoeCards).where(inArray(echoeCards.did, deckIds));
      const noteIds: number[] = Array.from(new Set(cards.map((c: Pick<EchoeCards, 'nid'>) => Number(c.nid))));

      if (noteIds.length > 0) {
        // Add notes to graves
        const now = Math.floor(Date.now() / 1000);
        for (const nid of noteIds) {
          await db.insert(echoeGraves).values({ usn: 0, oid: nid, type: 1 });
        }

        // Delete cards
        await db.delete(echoeCards).where(inArray(echoeCards.did, deckIds));

        // Delete notes
        await db.delete(echoeNotes).where(inArray(echoeNotes.id, noteIds));
      }

      // Delete sub-decks
      await db.delete(echoeDecks).where(inArray(echoeDecks.id, deckIds.slice(1)));
    }

    // Add deck to graves
    const now = Math.floor(Date.now() / 1000);
    await db.insert(echoeGraves).values({ usn: 0, oid: id, type: 0 });

    // Delete deck
    await db.delete(echoeDecks).where(eq(echoeDecks.id, id));

    return true;
  }

  /**
   * Get deck and all sub-deck IDs
   */
  async getDeckAndSubdeckIds(id: number): Promise<number[]> {
    const db = getDatabase();

    const deck = await db
      .select({ name: echoeDecks.name })
      .from(echoeDecks)
      .where(eq(echoeDecks.id, id))
      .limit(1);

    if (deck.length === 0) {
      return [];
    }

    const result: number[] = [id];
    const subDecks = await db
      .select({ id: echoeDecks.id })
      .from(echoeDecks)
      .where(like(echoeDecks.name, `${deck[0].name}::%`));

    for (const subDeck of subDecks) {
      result.push(Number(subDeck.id));
    }

    return result;
  }

  /**
   * Get deck config by deck ID
   */
  async getDeckConfig(deckId: number): Promise<EchoeDeckConfigDto | null> {
    const db = getDatabase();

    const deck = await db.select().from(echoeDecks).where(eq(echoeDecks.id, deckId)).limit(1);

    if (deck.length === 0) {
      return null;
    }

    const config = await db.select().from(echoeDeckConfig).where(eq(echoeDeckConfig.id, deck[0].conf)).limit(1);

    if (config.length === 0) {
      return null;
    }

    return this.mapConfigToDto(config[0]);
  }

  /**
   * Update deck config
   */
  async updateDeckConfig(deckId: number, dto: UpdateEchoeDeckConfigDto): Promise<EchoeDeckConfigDto | null> {
    const db = getDatabase();

    const deck = await db.select().from(echoeDecks).where(eq(echoeDecks.id, deckId)).limit(1);

    if (deck.length === 0) {
      return null;
    }

    const config = await db.select().from(echoeDeckConfig).where(eq(echoeDeckConfig.id, deck[0].conf)).limit(1);

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

    await db.update(echoeDeckConfig).set(updates).where(eq(echoeDeckConfig.id, deck[0].conf));

    const updated = await db.select().from(echoeDeckConfig).where(eq(echoeDeckConfig.id, deck[0].conf)).limit(1);

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
      id: Number(config.id),
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
  async createFilteredDeck(dto: CreateFilteredDeckDto, buildNow: boolean = true): Promise<EchoeDeckWithCountsDto> {
    const db = getDatabase();

    // Generate deck ID (Unix timestamp in ms)
    const id = Date.now();
    const now = Math.floor(Date.now() / 1000);

    const newDeck: NewEchoeDecks = {
      id: id,
      name: dto.name,
      conf: 1,
      extendNew: 20,
      extendRev: 200,
      usn: 0,
      lim: 0,
      collapsed: 0,
      dyn: 1, // 1 = filtered deck
      mod: now,
      desc: `Search: ${dto.searchQuery}`,
      mid: 0,
    };

    await db.insert(echoeDecks).values(newDeck);

    if (buildNow) {
      await this.buildFilteredDeck(id, dto.searchQuery, dto.rebuildDaily ?? false);
    }

    return this.getDeckById(id) as Promise<EchoeDeckWithCountsDto>;
  }

  /**
   * Rebuild a filtered deck by running the search query
   */
  async rebuildFilteredDeck(deckId: number): Promise<boolean> {
    const db = getDatabase();

    // Get deck info
    const deck = await db.select().from(echoeDecks).where(eq(echoeDecks.id, deckId)).limit(1);

    if (deck.length === 0 || deck[0].dyn !== 1) {
      return false;
    }

    // Extract search query from description (format: "Search: <query>")
    const searchQuery = deck[0].desc?.replace(/^Search: /, '') || '';
    const rebuildDaily = deck[0].extendNew > 0; // Use extendNew as rebuildDaily flag

    // First, empty current filtered cards back to their original decks
    await this.emptyFilteredDeck(deckId);

    // Then rebuild with new cards
    await this.buildFilteredDeck(deckId, searchQuery, rebuildDaily);

    return true;
  }

  /**
   * Empty a filtered deck - return cards to their original decks
   */
  async emptyFilteredDeck(deckId: number): Promise<boolean> {
    const db = getDatabase();

    // Get deck info
    const deck = await db.select().from(echoeDecks).where(eq(echoeDecks.id, deckId)).limit(1);

    if (deck.length === 0 || deck[0].dyn !== 1) {
      return false;
    }

    // Find cards in this filtered deck that have odid set (original deck)
    const cards = await db
      .select()
      .from(echoeCards)
      .where(and(eq(echoeCards.did, deckId), sql`${echoeCards.odid} IS NOT NULL AND ${echoeCards.odid} != 0`));

    if (cards.length === 0) {
      return true;
    }

    // Move cards back to their original deck
    const now = Math.floor(Date.now() / 1000);
    for (const card of cards) {
      await db
        .update(echoeCards)
        .set({
          did: Number(card.odid),
          odid: 0,
          odue: 0,
          mod: now,
          usn: 0,
        })
        .where(eq(echoeCards.id, card.id));
    }

    return true;
  }

  /**
   * Preview a filtered deck - show sample cards without modifying data
   */
  async previewFilteredDeck(searchQuery: string, limit: number = 5): Promise<FilteredDeckPreviewDto> {
    const db = getDatabase();
    const cards = await this.findCardsBySearch(searchQuery, limit);

    // Map to DTO format
    const sampleCards: EchoeCardListItemDto[] = await Promise.all(
      cards.map(async (card) => {
        // Get note info
        const note = await db.select().from(echoeNotes).where(eq(echoeNotes.id, card.nid)).limit(1);
        const noteData = note[0];

        // Get deck name
        const deck = await db.select().from(echoeDecks).where(eq(echoeDecks.id, card.did)).limit(1);

        // Get note type name
        const noteType = noteData?.mid
          ? await db.select().from(echoeNotetypes).where(eq(echoeNotetypes.id, noteData.mid)).limit(1)
          : [];

        // Parse fields from fieldsJson (primary source)
        const fields: Record<string, string> =
          noteData?.fieldsJson && typeof noteData.fieldsJson === 'object' && Object.keys(noteData.fieldsJson).length > 0
            ? (noteData.fieldsJson as Record<string, string>)
            : {};
        const front = fields['Front'] || fields['front'] || Object.values(fields)[0] || '';

        return {
          id: Number(card.id),
          nid: Number(card.nid),
          did: Number(card.did),
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
          mid: Number(noteData?.mid) || 0,
          notetypeName: noteType[0]?.name || 'Unknown',
          addedAt: Number(noteData?.id) ? Math.floor(Number(noteData.id) / 1000) : 0,
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
  private async buildFilteredDeck(deckId: number, searchQuery: string, rebuildDaily: boolean): Promise<void> {
    const db = getDatabase();
    const now = Math.floor(Date.now() / 1000);

    // Find cards matching search
    const cards = await this.findCardsBySearch(searchQuery, 10000); // Limit to 10000 cards

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
        .where(eq(echoeCards.id, card.id));
    }
  }

  /**
   * Find cards by search query
   */
  private async findCardsBySearch(searchQuery: string, limit: number = 1000): Promise<any[]> {
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
        const decks = await db.select().from(echoeDecks).where(sql`${echoeDecks.name} LIKE ${`%${deckName}%`}`);
        const deckIds = decks.map((d: Pick<EchoeDecks, 'id'>) => Number(d.id));
        if (deckIds.length > 0) {
          conditions.push(inArray(echoeCards.did, deckIds));
        }
      } else if (term.startsWith('tag:')) {
        // Filter by tag
        const tag = term.substring(4).replace(/"/g, '');
        const notes = await db.select({ id: echoeNotes.id }).from(echoeNotes).where(sql`${echoeNotes.tags} LIKE ${`%"${tag}"%`}`);
        const noteIds = notes.map((n: Pick<EchoeNotes, 'id'>) => n.id);
        if (noteIds.length > 0) {
          conditions.push(inArray(echoeNotes.id, noteIds));
        } else {
          return []; // No notes with this tag
        }
      } else if (term === 'is:new' || term === 'is:learning') {
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
          .select({ id: echoeNotes.id })
          .from(echoeNotes)
          .where(sql`${echoeNotes.sfld} LIKE ${`%${fieldSearch}%`}`);
        const noteIds = notes.map((n: Pick<EchoeNotes, 'id'>) => n.id);
        if (noteIds.length > 0) {
          conditions.push(inArray(echoeNotes.id, noteIds));
        } else {
          return [];
        }
      } else if (term.startsWith('"') && term.endsWith('"')) {
        // Quoted string - search in sfld
        const text = term.replace(/"/g, '');
        const notes = await db
          .select({ id: echoeNotes.id })
          .from(echoeNotes)
          .where(sql`${echoeNotes.sfld} LIKE ${`%${text}%`}`);
        const noteIds = notes.map((n: Pick<EchoeNotes, 'id'>) => n.id);
        if (noteIds.length > 0) {
          conditions.push(inArray(echoeNotes.id, noteIds));
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
        let noteIds: number[] = [];
        for (const cond of conditions) {
          if (cond && typeof cond === 'object' && 'constructor' in cond) {
            const notes = await db.select({ id: echoeNotes.id }).from(echoeNotes).where(cond);
            noteIds = [...noteIds, ...notes.map((n: Pick<EchoeNotes, 'id'>) => n.id)];
          }
        }
        // Remove duplicates
        noteIds = [...new Set(noteIds)];

        if (noteIds.length === 0) {
          return [];
        }

        // Get cards for these notes
        const cardRecords = await db.select().from(echoeCards).where(inArray(echoeCards.nid, noteIds));
        cards = cardRecords;
      } else {
        // Direct card conditions
        cards = await db.select().from(echoeCards).where(and(...conditions));
      }
    } else {
      // No conditions - return all cards (limited)
      cards = await db.select().from(echoeCards).limit(limit);
    }

    return cards.slice(0, limit);
  }
}
