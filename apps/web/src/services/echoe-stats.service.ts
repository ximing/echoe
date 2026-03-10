import { Service } from '@rabjs/react';
import { getTodayStats, getHistory, getMaturity, getForecast } from '../api/echoe';
import type {
  StudyTodayStatsDto,
  StudyHistoryDayDto,
  CardMaturityDto,
  ForecastDayDto,
} from '@echoe/dto';

/**
 * Echoe Statistics Service
 * Manages learning statistics state and operations
 */
export class EchoeStatsService extends Service {
  // State
  todayStats: StudyTodayStatsDto | null = null;
  history: StudyHistoryDayDto[] = [];
  maturity: CardMaturityDto | null = null;
  forecast: ForecastDayDto[] = [];

  // Filters
  selectedDeckId: number | undefined = undefined;

  // Loading states
  isLoadingToday = false;
  isLoadingHistory = false;
  isLoadingMaturity = false;
  isLoadingForecast = false;

  // Error state
  error: string | null = null;

  /**
   * Set selected deck for filtering
   */
  setDeckId(deckId: number | undefined): void {
    this.selectedDeckId = deckId;
    // Reload all stats when deck changes
    this.loadAllStats();
  }

  /**
   * Load all statistics
   */
  async loadAllStats(): Promise<void> {
    await Promise.all([
      this.loadTodayStats(),
      this.loadHistory(),
      this.loadMaturity(),
      this.loadForecast(),
    ]);
  }

  /**
   * Load today's study statistics
   */
  async loadTodayStats(): Promise<void> {
    this.isLoadingToday = true;
    this.error = null;

    try {
      const response = await getTodayStats(this.selectedDeckId);
      this.todayStats = response.data;
    } catch (err) {
      this.error = 'Failed to load today stats';
      console.error('Load today stats error:', err);
    } finally {
      this.isLoadingToday = false;
    }
  }

  /**
   * Load study history
   */
  async loadHistory(days: number = 30): Promise<void> {
    this.isLoadingHistory = true;
    this.error = null;

    try {
      const response = await getHistory(this.selectedDeckId, days);
      this.history = response.data;
    } catch (err) {
      this.error = 'Failed to load history';
      console.error('Load history error:', err);
    } finally {
      this.isLoadingHistory = false;
    }
  }

  /**
   * Load card maturity distribution
   */
  async loadMaturity(): Promise<void> {
    this.isLoadingMaturity = true;
    this.error = null;

    try {
      const response = await getMaturity(this.selectedDeckId);
      this.maturity = response.data;
    } catch (err) {
      this.error = 'Failed to load maturity';
      console.error('Load maturity error:', err);
    } finally {
      this.isLoadingMaturity = false;
    }
  }

  /**
   * Load forecast data
   */
  async loadForecast(days: number = 30): Promise<void> {
    this.isLoadingForecast = true;
    this.error = null;

    try {
      const response = await getForecast(this.selectedDeckId, days);
      this.forecast = response.data;
    } catch (err) {
      this.error = 'Failed to load forecast';
      console.error('Load forecast error:', err);
    } finally {
      this.isLoadingForecast = false;
    }
  }

  /**
   * Get total cards in maturity distribution
   */
  getTotalMatureCards(): number {
    if (!this.maturity) return 0;
    return this.maturity.new + this.maturity.learning + this.maturity.young + this.maturity.mature;
  }

  /**
   * Get average reviews per day from history
   */
  getAverageReviewsPerDay(): number {
    if (this.history.length === 0) return 0;
    const total = this.history.reduce((sum, day) => sum + day.count, 0);
    return Math.round(total / this.history.length);
  }

  /**
   * Get total time spent from history (in ms)
   */
  getTotalTimeSpent(): number {
    return this.history.reduce((sum, day) => sum + day.timeSpent, 0);
  }

  /**
   * Get maximum due count from forecast
   */
  getMaxForecastDue(): number {
    if (this.forecast.length === 0) return 0;
    return Math.max(...this.forecast.map((d) => d.dueCount));
  }
}

// Export singleton instance
export const echoeStatsService = new EchoeStatsService();
