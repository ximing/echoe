import { JsonController, Get, Post, Body, QueryParam, Param, CurrentUser } from 'routing-controllers';
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
  DeleteCardsDto,
  StudyOptionsDto,
  UserInfoDto,
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
    @QueryParam('deckId') deckId?: string,
    @QueryParam('limit') limit?: number,
    @QueryParam('reviewAhead') reviewAhead?: number,
    @QueryParam('preview') preview?: boolean,
    @CurrentUser() userDto?: UserInfoDto
  ) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const params: StudyQueueParams = {
        deckId,
        limit,
        reviewAhead,
        preview,
      };

      const queue = await this.echoeStudyService.getQueue(userDto.uid, params);
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
  async submitReview(@Body() dto: ReviewSubmissionDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (dto == null || dto.cardId == null || dto.rating == null || dto.timeTaken == null) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      if (!dto.cardId || dto.cardId.trim() === '') {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'cardId is required');
      }

      if (!Number.isInteger(dto.rating) || dto.rating < 1 || dto.rating > 4) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'Rating must be 1-4');
      }

      if (!Number.isFinite(dto.timeTaken) || dto.timeTaken < 0) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'timeTaken must be a non-negative number');
      }

      const result = await this.echoeStudyService.submitReview(userDto.uid, dto);
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Submit review error:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, error.message);
      }
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/study/undo
   * Undo the last review
   */
  @Post('/undo')
  async undo(@QueryParam('reviewId') reviewId?: string, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const result = await this.echoeStudyService.undo(userDto.uid, reviewId);
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
  async buryCards(@Body() dto: BuryCardsDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (!dto.cardIds || dto.cardIds.length === 0) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      await this.echoeStudyService.buryCards(userDto.uid, dto.cardIds, dto.mode || 'card');
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
  async forgetCards(@Body() dto: ForgetCardsDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (!dto.cardIds || dto.cardIds.length === 0) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      await this.echoeStudyService.forgetCards(userDto.uid, dto.cardIds);
      return ResponseUtil.success({ success: true });
    } catch (error) {
      logger.error('Forget cards error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/study/delete
   * Delete cards (soft-delete with cascade to revlog)
   */
  @Post('/delete')
  async deleteCards(@Body() dto: DeleteCardsDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (!dto.cardIds || dto.cardIds.length === 0) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const deletedCount = await this.echoeStudyService.deleteCards(userDto.uid, dto.cardIds);
      return ResponseUtil.success({ success: true, deletedCount });
    } catch (error) {
      logger.error('Delete cards error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/study/counts
   * Get study counts for a deck
   */
  @Get('/counts')
  async getCounts(@QueryParam('deckId') deckId?: string, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const counts = await this.echoeStudyService.getCounts(userDto.uid, deckId);
      return ResponseUtil.success(counts);
    } catch (error) {
      logger.error('Get counts error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/study/options
   * Get scheduling options for a card (preview of all rating outcomes)
   */
  @Get('/options')
  async getOptions(@QueryParam('cardId') cardId: string, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (!cardId || cardId.trim() === '') {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'cardId is required');
      }

      const options = await this.echoeStudyService.getOptions(userDto.uid, cardId);
      return ResponseUtil.success(options);
    } catch (error) {
      logger.error('Get options error:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, error.message);
      }
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
