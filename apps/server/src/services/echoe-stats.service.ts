import { Service } from 'typedi';
import { eq, and, gte, lte, sql, inArray } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { echoeRevlog } from '../db/schema/echoe-revlog.js';
import { echoeCards } from '../db/schema/echoe-cards.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { echoeDecks } from '../db/schema/echoe-decks.js';

import type {
  StudyTodayStatsDto,
  StudyHistoryDayDto,
  CardMaturityDto,
  ForecastDayDto,
} from '@echoe/dto';

@Service()
export class EchoeStatsService {
  /**
   * Get today's study statistics
   */
  async getTodayStats(deckId?: number): Promise<StudyTodayStatsDto> {
    const db = getDatabase();

    // Get start of today (midnight UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStart = today.getTime();

    // Build filter conditions
    let cardFilter: ReturnType<typeof inArray> | undefined = undefined;
    if (deckId !== undefined) {
      // Get deck and sub-deck IDs
      const deckIds = await this.getDeckAndSubdeckIds(deckId);
      cardFilter = inArray(echoeCards.did, deckIds);
    }

    // Get today's reviews
    let query = db
      .select({
        ease: echoeRevlog.ease,
        time: echoeRevlog.time,
        cid: echoeRevlog.cid,
      })
      .from(echoeRevlog)
      .where(gte(echoeRevlog.id, todayStart * 1000));

    if (deckId !== undefined) {
      // Join with cards to filter by deck
      query = db
        .select({
          ease: echoeRevlog.ease,
          time: echoeRevlog.time,
          cid: echoeRevlog.cid,
        })
        .from(echoeRevlog)
        .innerJoin(echoeCards, eq(echoeRevlog.cid, echoeCards.id))
        .where(
          and(
            gte(echoeRevlog.id, todayStart * 1000),
            cardFilter
          )
        );
    }

    const reviews = await query;

    // Aggregate by ease rating
    const stats: StudyTodayStatsDto = {
      studied: 0,
      timeSpent: 0,
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
    };

    for (const review of reviews) {
      stats.studied++;
      stats.timeSpent += Number(review.time);

      switch (review.ease) {
        case 1:
          stats.again++;
          break;
        case 2:
          stats.hard++;
          break;
        case 3:
          stats.good++;
          break;
        case 4:
          stats.easy++;
          break;
      }
    }

    return stats;
  }

  /**
   * Get study history for the last N days
   */
  async getHistory(deckId?: number, days: number = 30): Promise<StudyHistoryDayDto[]> {
    const db = getDatabase();

    // Get start date
    const startDate = new Date();
    startDate.setUTCHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - days + 1);
    const startTimestamp = startDate.getTime();

    let query;
    if (deckId !== undefined) {
      const deckIds = await this.getDeckAndSubdeckIds(deckId);
      query = db
        .select({
          id: echoeRevlog.id,
          ease: echoeRevlog.ease,
          time: echoeRevlog.time,
        })
        .from(echoeRevlog)
        .innerJoin(echoeCards, eq(echoeRevlog.cid, echoeCards.id))
        .where(
          and(
            gte(echoeRevlog.id, startTimestamp * 1000),
            inArray(echoeCards.did, deckIds)
          )
        );
    } else {
      query = db
        .select({
          id: echoeRevlog.id,
          ease: echoeRevlog.ease,
          time: echoeRevlog.time,
        })
        .from(echoeRevlog)
        .where(gte(echoeRevlog.id, startTimestamp * 1000));
    }

    const reviews = await query;

    // Group by day
    const dayMap = new Map<string, StudyHistoryDayDto>();

    // Initialize all days
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      dayMap.set(dateStr, { date: dateStr, count: 0, timeSpent: 0 });
    }

    // Aggregate reviews
    for (const review of reviews) {
      const date = new Date(Number(review.id) / 1000);
      const dateStr = date.toISOString().split('T')[0];
      const day = dayMap.get(dateStr);
      if (day) {
        day.count++;
        day.timeSpent += Number(review.time);
      }
    }

    return Array.from(dayMap.values());
  }

  /**
   * Calculate retrievability: R(t,S) = (1 + t/(9S))^(-1)
   * @param lastReview - Last review timestamp (Unix ms)
   * @param stability - Stability in days
   * @returns Retrievability between 0 and 1
   */
  private calculateRetrievability(lastReview: number, stability: number): number {
    if (stability <= 0 || lastReview === 0) {
      return 1; // New cards have full retrievability
    }
    const dayMs = 86400000;
    const now = Date.now();
    const t = (now - lastReview) / dayMs; // days since last review
    const S = stability;
    return 1 / (1 + t / (9 * S));
  }

  /**
   * Get card maturity distribution using FSRS stability
   */
  async getMaturity(deckId?: number): Promise<CardMaturityDto> {
    const db = getDatabase();

    let query;
    if (deckId !== undefined) {
      const deckIds = await this.getDeckAndSubdeckIds(deckId);
      query = db
        .select({
          stability: echoeCards.stability,
          lastReview: echoeCards.lastReview,
        })
        .from(echoeCards)
        .where(inArray(echoeCards.did, deckIds));
    } else {
      query = db
        .select({
          stability: echoeCards.stability,
          lastReview: echoeCards.lastReview,
        })
        .from(echoeCards);
    }

    const cards = await query;

    const maturity: CardMaturityDto = {
      new: 0,
      learning: 0,
      young: 0,
      mature: 0,
    };

    for (const card of cards) {
      const stability = card.stability;
      const lastReview = card.lastReview;

      // New card: never reviewed (lastReview = 0) or stability = 0
      if (lastReview === 0 || stability === 0) {
        maturity.new++;
      } else if (stability < 21) {
        maturity.learning++;
      } else if (stability < 90) {
        maturity.young++;
      } else {
        maturity.mature++;
      }
    }

    return maturity;
  }

  /**
   * Get forecast of due cards for the next N days
   */
  async getForecast(deckId?: number, days: number = 30): Promise<ForecastDayDto[]> {
    const db = getDatabase();

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStartMs = today.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const forecastEndMs = todayStartMs + days * dayMs;

    let query;
    if (deckId !== undefined) {
      const deckIds = await this.getDeckAndSubdeckIds(deckId);
      query = db
        .select({
          due: echoeCards.due,
          queue: echoeCards.queue,
        })
        .from(echoeCards)
        .where(
          and(
            inArray(echoeCards.did, deckIds),
            // Cards that are review (queue=2) or learning (queue=1,3), within forecast window
            sql`${echoeCards.queue} IN (1, 2, 3)`,
            gte(echoeCards.due, todayStartMs),
            lte(echoeCards.due, forecastEndMs - 1)
          )
        );
    } else {
      query = db
        .select({
          due: echoeCards.due,
          queue: echoeCards.queue,
        })
        .from(echoeCards)
        .where(
          and(
            sql`${echoeCards.queue} IN (1, 2, 3)`,
            gte(echoeCards.due, todayStartMs),
            lte(echoeCards.due, forecastEndMs - 1)
          )
        );
    }

    const cards = await query;

    // Group by due date
    const forecastMap = new Map<string, number>();

    // Initialize all days
    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      forecastMap.set(dateStr, 0);
    }

    // Count cards by due date bucket using due(ms)
    for (const card of cards) {
      const dueMs = Number(card.due);
      if (!Number.isFinite(dueMs) || dueMs < todayStartMs || dueMs >= forecastEndMs) {
        continue;
      }

      const daysUntilDue = Math.floor((dueMs - todayStartMs) / dayMs);
      const date = new Date(today);
      date.setDate(date.getDate() + daysUntilDue);
      const dateStr = date.toISOString().split('T')[0];
      forecastMap.set(dateStr, (forecastMap.get(dateStr) || 0) + 1);
    }

    return Array.from(forecastMap.entries()).map(([date, dueCount]) => ({
      date,
      dueCount,
    }));
  }

  /**
   * Get the user's consecutive learning streak in days
   */
  async getStreak(): Promise<number> {
    const db = getDatabase();

    // Get today's start (UTC midnight)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // We look back up to 365 days to find the streak
    const maxDays = 365;
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - maxDays);
    const startTimestamp = startDate.getTime();

    // Query all review log IDs (bigint, Unix ms × 1000) from the past year
    const reviews = await db
      .select({ id: echoeRevlog.id })
      .from(echoeRevlog)
      .where(gte(echoeRevlog.id, startTimestamp * 1000));

    // Build a set of UTC date strings that have reviews
    const daysWithReviews = new Set<string>();
    for (const review of reviews) {
      const date = new Date(Number(review.id) / 1000);
      daysWithReviews.add(date.toISOString().split('T')[0]);
    }

    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // If neither today nor yesterday has reviews, streak = 0
    if (!daysWithReviews.has(todayStr) && !daysWithReviews.has(yesterdayStr)) {
      return 0;
    }

    // Start counting from today if today has reviews, otherwise from yesterday
    const startDay = daysWithReviews.has(todayStr) ? today : yesterday;
    let streak = 0;
    const current = new Date(startDay);

    while (true) {
      const dateStr = current.toISOString().split('T')[0];
      if (!daysWithReviews.has(dateStr)) break;
      streak++;
      current.setDate(current.getDate() - 1);
    }

    return streak;
  }

  /**
   * Get maturity distribution for all decks in a single query using FSRS stability
   */
  async getMaturityBatch(): Promise<{
    decks: Array<{
      deckId: number;
      new: number;
      learning: number;
      young: number;
      mature: number;
    }>;
  }> {
    const db = getDatabase();

    const cards = await db
      .select({
        did: echoeCards.did,
        stability: echoeCards.stability,
        lastReview: echoeCards.lastReview,
      })
      .from(echoeCards);

    const deckMap = new Map<
      number,
      { new: number; learning: number; young: number; mature: number }
    >();

    for (const card of cards) {
      const deckId = card.did;
      if (!deckMap.has(deckId)) {
        deckMap.set(deckId, { new: 0, learning: 0, young: 0, mature: 0 });
      }
      const entry = deckMap.get(deckId)!;
      const stability = card.stability;
      const lastReview = card.lastReview;

      // New card: never reviewed (lastReview = 0) or stability = 0
      if (lastReview === 0 || stability === 0) {
        entry.new++;
      } else if (stability < 21) {
        entry.learning++;
      } else if (stability < 90) {
        entry.young++;
      } else {
        entry.mature++;
      }
    }

    return {
      decks: Array.from(deckMap.entries()).map(([deckId, counts]) => ({
        deckId,
        ...counts,
      })),
    };
  }

  /**
   * Get deck and all sub-deck IDs
   */
  private async getDeckAndSubdeckIds(id: number): Promise<number[]> {
    const db = getDatabase();
    const result: number[] = [id];

    // Get all decks
    const decks = await db.select().from(echoeDecks);

    // Find all sub-decks
    const findSubdecks = (parentId: number) => {
      const parentDeck = decks.find((d) => Number(d.id) === parentId);
      if (!parentDeck) return;

      const prefix = parentDeck.name + '::';
      for (const deck of decks) {
        if (deck.name.startsWith(prefix)) {
          result.push(Number(deck.id));
          findSubdecks(Number(deck.id));
        }
      }
    };

    findSubdecks(id);

    return result;
  }
}
