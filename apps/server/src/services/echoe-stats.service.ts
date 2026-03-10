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
   * Get card maturity distribution
   */
  async getMaturity(deckId?: number): Promise<CardMaturityDto> {
    const db = getDatabase();

    let query;
    if (deckId !== undefined) {
      const deckIds = await this.getDeckAndSubdeckIds(deckId);
      query = db
        .select({
          ivl: echoeCards.ivl,
        })
        .from(echoeCards)
        .where(inArray(echoeCards.did, deckIds));
    } else {
      query = db
        .select({
          ivl: echoeCards.ivl,
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
      const ivl = card.ivl;
      if (ivl === 0) {
        maturity.new++;
      } else if (ivl < 21) {
        maturity.learning++;
      } else if (ivl < 90) {
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
    const todayTimestamp = Math.floor(today.getTime() / 86400000); // Day number

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
            // Cards that are review (queue=2) or learning (queue=1,3)
            sql`${echoeCards.queue} IN (1, 2, 3)`
          )
        );
    } else {
      query = db
        .select({
          due: echoeCards.due,
          queue: echoeCards.queue,
        })
        .from(echoeCards)
        .where(sql`${echoeCards.queue} IN (1, 2, 3)`);
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

    // Count cards by due date
    for (const card of cards) {
      const dueDay = Number(card.due);
      const daysUntilDue = dueDay - todayTimestamp;

      if (daysUntilDue >= 0 && daysUntilDue < days) {
        const date = new Date(today);
        date.setDate(date.getDate() + daysUntilDue);
        const dateStr = date.toISOString().split('T')[0];
        forecastMap.set(dateStr, (forecastMap.get(dateStr) || 0) + 1);
      }
    }

    return Array.from(forecastMap.entries()).map(([date, dueCount]) => ({
      date,
      dueCount,
    }));
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
