import { JsonController, Get, QueryParam } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeStatsService } from '../../services/echoe-stats.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

@Service()
@JsonController('/api/v1/stats')
export class EchoeStatsController {
  constructor(private echoeStatsService: EchoeStatsService) {}

  /**
   * GET /api/v1/stats/today
   * Get today's study statistics
   */
  @Get('/today')
  async getTodayStats(@QueryParam('deckId') deckId?: number) {
    try {
      const stats = await this.echoeStatsService.getTodayStats(deckId);
      return ResponseUtil.success(stats);
    } catch (error) {
      logger.error('Get today stats error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/stats/history
   * Get study history for the last N days
   */
  @Get('/history')
  async getHistory(
    @QueryParam('deckId') deckId?: number,
    @QueryParam('days') daysStr?: string
  ) {
    try {
      const days = daysStr ? parseInt(daysStr, 10) : 30;
      if (isNaN(days) || days < 1 || days > 365) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'days must be between 1 and 365');
      }
      const history = await this.echoeStatsService.getHistory(deckId, days);
      return ResponseUtil.success(history);
    } catch (error) {
      logger.error('Get history error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/stats/maturity
   * Get card maturity distribution
   */
  @Get('/maturity')
  async getMaturity(@QueryParam('deckId') deckId?: number) {
    try {
      const maturity = await this.echoeStatsService.getMaturity(deckId);
      return ResponseUtil.success(maturity);
    } catch (error) {
      logger.error('Get maturity error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/stats/forecast
   * Get forecast of due cards for the next N days
   */
  @Get('/forecast')
  async getForecast(
    @QueryParam('deckId') deckId?: number,
    @QueryParam('days') daysStr?: string
  ) {
    try {
      const days = daysStr ? parseInt(daysStr, 10) : 30;
      if (isNaN(days) || days < 1 || days > 365) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'days must be between 1 and 365');
      }
      const forecast = await this.echoeStatsService.getForecast(deckId, days);
      return ResponseUtil.success(forecast);
    } catch (error) {
      logger.error('Get forecast error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/stats/streak
   * Get the user's consecutive learning streak in days
   */
  @Get('/streak')
  async getStreak() {
    try {
      const streak = await this.echoeStatsService.getStreak();
      return ResponseUtil.success({ streak });
    } catch (error) {
      logger.error('Get streak error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/stats/maturity/batch
   * Get maturity distribution for all decks in a single request
   */
  @Get('/maturity/batch')
  async getMaturityBatch() {
    try {
      const result = await this.echoeStatsService.getMaturityBatch();
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Get maturity batch error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
