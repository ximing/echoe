import { JsonController, Get, Post, Put, Delete, Body, Param, QueryParam, CurrentUser } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { InboxService } from '../../services/inbox.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type {
  CreateInboxDto,
  UpdateInboxDto,
  InboxDto,
  InboxListItemDto,
  InboxQueryParams,
  UserInfoDto,
} from '@echoe/dto';

@Service()
@JsonController('/api/v1/inbox')
export class InboxController {
  constructor(private inboxService: InboxService) {}

  /**
   * GET /api/v1/inbox
   * List inbox items with pagination and filters
   */
  @Get('/')
  async getInboxItems(
    @QueryParam('category') category?: string,
    @QueryParam('isRead') isRead?: number,
    @QueryParam('page') page?: number,
    @QueryParam('limit') limit?: number,
    @CurrentUser() userDto?: UserInfoDto
  ) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const params = {
        category,
        isRead,
        page: page || 1,
        pageSize: limit || 20,
      };

      const result = await this.inboxService.list(userDto.uid, params);
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Get inbox items error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/inbox/:inboxId
   * Get a single inbox item by ID
   */
  @Get('/:inboxId')
  async getInboxById(@Param('inboxId') inboxId: string, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const inboxItem = await this.inboxService.findByIdAndUid(userDto.uid, inboxId);
      if (!inboxItem) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success(inboxItem);
    } catch (error) {
      logger.error('Get inbox item by ID error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/inbox
   * Create a new inbox item
   */
  @Post('/')
  async createInboxItem(@Body() dto: CreateInboxDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (!dto.front || !dto.back) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const inboxItem = await this.inboxService.create(userDto.uid, dto);
      return ResponseUtil.success(inboxItem);
    } catch (error) {
      logger.error('Create inbox item error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * PUT /api/v1/inbox/:inboxId
   * Update an inbox item
   */
  @Put('/:inboxId')
  async updateInboxItem(
    @Param('inboxId') inboxId: string,
    @Body() dto: UpdateInboxDto,
    @CurrentUser() userDto?: UserInfoDto
  ) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const inboxItem = await this.inboxService.update(userDto.uid, inboxId, dto);
      return ResponseUtil.success(inboxItem);
    } catch (error) {
      logger.error('Update inbox item error:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * DELETE /api/v1/inbox/:inboxId
   * Delete an inbox item (soft delete)
   */
  @Delete('/:inboxId')
  async deleteInboxItem(@Param('inboxId') inboxId: string, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const result = await this.inboxService.delete(userDto.uid, inboxId);
      if (!result) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.success({ success: true });
    } catch (error) {
      logger.error('Delete inbox item error:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/inbox/:inboxId/read
   * Mark an inbox item as read
   */
  @Post('/:inboxId/read')
  async markAsRead(@Param('inboxId') inboxId: string, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const inboxItem = await this.inboxService.markRead(userDto.uid, inboxId);
      return ResponseUtil.success(inboxItem);
    } catch (error) {
      logger.error('Mark inbox item as read error:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return ResponseUtil.error(ErrorCode.NOT_FOUND);
      }
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/inbox/read-all
   * Mark all inbox items as read
   */
  @Post('/read-all')
  async markAllAsRead(@CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const result = await this.inboxService.markReadAll(userDto.uid);
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Mark all inbox items as read error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
