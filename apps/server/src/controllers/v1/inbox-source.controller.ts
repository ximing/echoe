import { JsonController, Get, Post, Body, CurrentUser } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { InboxSourceService } from '../../services/inbox-source.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type { CreateSourceDto, SourceListResponse, UserInfoDto } from '@echoe/dto';

@Service()
@JsonController('/api/v1/inbox/sources')
export class InboxSourceController {
  constructor(private inboxSourceService: InboxSourceService) {}

  /**
   * GET /api/v1/inbox/sources
   * List all sources for the current user
   */
  @Get('/')
  async listSources(@CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const sources = await this.inboxSourceService.list(userDto.uid);
      const response: SourceListResponse = {
        sources,
        total: sources.length,
      };

      return ResponseUtil.success(response);
    } catch (error) {
      logger.error('List inbox sources error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/inbox/sources
   * Create a new source
   */
  @Post('/')
  async createSource(@Body() dto: CreateSourceDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (!dto.name || dto.name.trim() === '') {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const source = await this.inboxSourceService.create(userDto.uid, dto.name.trim());
      return ResponseUtil.success(source);
    } catch (error) {
      logger.error('Create inbox source error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
