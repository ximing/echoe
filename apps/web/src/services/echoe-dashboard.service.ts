import { Service } from '@rabjs/react';
import { getStreak, getMaturityBatch, getHistory, getForecast } from '../api/echoe';
import type { MaturityBatchDeck } from '../api/echoe';
import type { StudyHistoryDayDto, ForecastDayDto } from '@echoe/dto';
import { EchoeDeckService } from './echoe-deck.service';

/**
 * Echoe Dashboard Service
 * Manages dashboard page data: streak, maturity batch, history, and forecast
 */
export class EchoeDashboardService extends Service {
  // State
  streak: number = 0;
  maturityBatch: MaturityBatchDeck[] = [];
  history: StudyHistoryDayDto[] = [];
  historyDays: 7 | 30 = 7;
  forecast: ForecastDayDto[] = [];
  loading: boolean = false;

  // Access the global EchoeDeckService singleton via DI
  get deckService(): EchoeDeckService {
    return this.resolve(EchoeDeckService);
  }

  /**
   * Load streak data
   */
  async loadStreak(): Promise<void> {
    try {
      const response = await getStreak();
      this.streak = response.data.streak;
    } catch (err) {
      console.error('Load streak error:', err);
    }
  }

  /**
   * Load maturity batch data for all decks
   */
  async loadMaturityBatch(): Promise<void> {
    try {
      const response = await getMaturityBatch();
      this.maturityBatch = response.data.decks;
    } catch (err) {
      console.error('Load maturity batch error:', err);
    }
  }

  /**
   * Load study history for the given number of days
   */
  async loadHistory(days: 7 | 30 = this.historyDays): Promise<void> {
    this.historyDays = days;
    try {
      const response = await getHistory(undefined, days);
      this.history = response.data;
    } catch (err) {
      console.error('Load history error:', err);
    }
  }

  /**
   * Load forecast data (14 days)
   */
  async loadForecast(): Promise<void> {
    try {
      const response = await getForecast(undefined, 14);
      this.forecast = response.data;
    } catch (err) {
      console.error('Load forecast error:', err);
    }
  }

  /**
   * Load all dashboard data
   */
  async loadAll(): Promise<void> {
    this.loading = true;
    try {
      await Promise.all([
        this.loadStreak(),
        this.loadMaturityBatch(),
        this.loadHistory(this.historyDays),
        this.loadForecast(),
      ]);
    } finally {
      this.loading = false;
    }
  }
}
