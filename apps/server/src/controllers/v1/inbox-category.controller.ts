import { JsonController, Get, Post, Delete, Body, Param, CurrentUser } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { InboxCategoryService } from '../../services/inbox-category.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type { CreateCategoryDto, CategoryListResponse, UserInfoDto } from '@echoe/dto';

@Service()
@JsonController('/api/v1/inbox/categories')
export class InboxCategoryController {
  constructor(private inboxCategoryService: InboxCategoryService) {}

  /**
   * GET /api/v1/inbox/categories
   * List all categories for the current user
   */
  @Get('/')
  async listCategories(@CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const categories = await this.inboxCategoryService.list(userDto.uid);
      const response: CategoryListResponse = {
        categories,
        total: categories.length,
      };

      return ResponseUtil.success(response);
    } catch (error) {
      logger.error('List inbox categories error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/inbox/categories
   * Create a new category
   */
  @Post('/')
  async createCategory(@Body() dto: CreateCategoryDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (!dto.name || dto.name.trim() === '') {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      const category = await this.inboxCategoryService.create(userDto.uid, dto.name.trim());
      return ResponseUtil.success(category);
    } catch (error) {
      logger.error('Create inbox category error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * DELETE /api/v1/inbox/categories/:id
   * Delete a category and clear related inbox records
   */
  @Delete('/:id')
  async deleteCategory(@Param('id') id: string, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const categoryId = parseInt(id, 10);
      if (isNaN(categoryId)) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR);
      }

      await this.inboxCategoryService.delete(userDto.uid, categoryId);
      return ResponseUtil.success({ message: 'Category deleted successfully' });
    } catch (error) {
      logger.error('Delete inbox category error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
