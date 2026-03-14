/**
 * Echoe Tag Controller
 * Handles tag management for notes
 */

import {
  JsonController,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  QueryParam,
  CurrentUser,
} from 'routing-controllers';
import { Service } from 'typedi';

import { EchoeTagService } from '../../services/echoe-tag.service.js';
import { ResponseUtil } from '../../utils/response.js';
import { ErrorCode } from '../../constants/error-codes.js';

import type { EchoeTagDto, RenameTagDto, MergeTagsDto, UserInfoDto } from '@echoe/dto';

@JsonController('/api/v1')
@Service()
export class EchoeTagController {
  constructor(private tagService: EchoeTagService) {}

  /**
   * GET /api/v1/tags
   * Get all tags with usage count, sorted by count descending
   */
  @Get('/tags')
  async getTags(@CurrentUser() userDto?: UserInfoDto) {
    if (!userDto?.uid) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
    }

    const tags = await this.tagService.getAllTags(userDto.uid);
    return ResponseUtil.success(tags);
  }

  /**
   * GET /api/v1/tags/search
   * Search tags by prefix (for autocomplete)
   */
  @Get('/tags/search')
  async searchTags(@QueryParam('q') query: string, @QueryParam('limit') limit?: number, @CurrentUser() userDto?: UserInfoDto) {
    if (!userDto?.uid) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
    }

    const tags = await this.tagService.searchTags(userDto.uid, query, limit);
    return ResponseUtil.success(tags);
  }

  /**
   * PUT /api/v1/tags/:tag/rename
   * Rename a tag across all notes
   */
  @Put('/tags/:tag/rename')
  async renameTag(@Param('tag') tag: string, @Body() dto: RenameTagDto, @CurrentUser() userDto?: UserInfoDto) {
    if (!userDto?.uid) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
    }

    const result = await this.tagService.renameTag(userDto.uid, tag, dto);
    return ResponseUtil.success(result);
  }

  /**
   * DELETE /api/v1/tags/:tag
   * Delete a tag (only if not in use)
   */
  @Delete('/tags/:tag')
  async deleteTag(@Param('tag') tag: string, @CurrentUser() userDto?: UserInfoDto) {
    if (!userDto?.uid) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
    }

    const result = await this.tagService.deleteTag(userDto.uid, tag);
    if (!result.deleted) {
      return ResponseUtil.error(ErrorCode.OPERATION_NOT_ALLOWED, result.message);
    }
    return ResponseUtil.success(result);
  }

  /**
   * POST /api/v1/tags/merge
   * Merge one tag into another
   */
  @Post('/tags/merge')
  async mergeTags(@Body() dto: MergeTagsDto, @CurrentUser() userDto?: UserInfoDto) {
    if (!userDto?.uid) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
    }

    const result = await this.tagService.mergeTags(userDto.uid, dto);
    return ResponseUtil.success(result);
  }
}
