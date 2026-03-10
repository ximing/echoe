import { JsonController, Get, Post, Body, QueryParam, Param } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeStudyService } from '../../services/echoe-study.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type {
  StudyQueueParams,
  ReviewSubmissionDto,
  StudyCountsDto,
  BuryCardsDto,
  ForgetCardsDto,
} from '@echoe/dto';

@Service()
@JsonController('/api/v1/study')
export class EchoeStudyController {
  constructor(private echoeStudyService: EchoeStudyService) {}

  /**
   * GET /api/v1/study/queue
   * Get study queue for a deck
   */
  @Get('/queue')
  async getQueue(
    @QueryParam('deckId') deckId?: number,
    @QueryParam('limit') limit?: number,
    @QueryParam('reviewAhead') reviewAhead?: number,
    @QueryParam('preview') preview?: boolean
  ) {
    try {
      const params: StudyQueueParams = {
        deckId,
        limit,
        reviewAhead,
        preview,
      };

      const queue = await this.echoeStudyService.getQueue(params);
      return ResponseUtil.success(queue);
    } catch (error) {
      logger.error('Get queue error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/study/review
   * Submit a card review
   */
  @Post('/review')
  async submitReview(@Body() dto: ReviewSubmissionDto) {
    try {
      if (!dto.cardId || !dto.rating || !dto.timeTaken) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      if (dto.rating < 1 || dto.rating > 4) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'Rating must be 1-4');
      }

      const result = await this.echoeStudyService.submitReview(dto);
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Submit review error:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/study/undo
   * Undo the last review
   */
  @Post('/undo')
  async undo(@QueryParam('reviewId') reviewId?: number) {
    try {
      const result = await this.echoeStudyService.undo(reviewId);
      if (!result.success) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, result.message);
      }
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Undo error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/study/bury
   * Bury cards
   */
  @Post('/bury')
  async buryCards(@Body() dto: BuryCardsDto) {
    try {
      if (!dto.cardIds || dto.cardIds.length === 0) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      await this.echoeStudyService.buryCards(dto.cardIds, dto.mode || 'card');
      return ResponseUtil.success({ success: true });
    } catch (error) {
      logger.error('Bury cards error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/study/forget
   * Forget cards (reset to new)
   */
  @Post('/forget')
  async forgetCards(@Body() dto: ForgetCardsDto) {
    try {
      if (!dto.cardIds || dto.cardIds.length === 0) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      await this.echoeStudyService.forgetCards(dto.cardIds);
      return ResponseUtil.success({ success: true });
    } catch (error) {
      logger.error('Forget cards error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/study/counts
   * Get study counts for a deck
   */
  @Get('/counts')
  async getCounts(@QueryParam('deckId') deckId?: number) {
    try {
      const counts = await this.echoeStudyService.getCounts(deckId);
      return ResponseUtil.success(counts);
    } catch (error) {
      logger.error('Get counts error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
