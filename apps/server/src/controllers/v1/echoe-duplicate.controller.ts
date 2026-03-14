import { JsonController, Post, Body, CurrentUser } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeDuplicateService } from '../../services/echoe-duplicate.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type { FindDuplicatesDto, MergeDuplicatesDto, UserInfoDto } from '@echoe/dto';

@Service()
@JsonController('/api/v1')
export class EchoeDuplicateController {
  constructor(private echoeDuplicateService: EchoeDuplicateService) {}

  /**
   * POST /api/v1/notes/find-duplicates
   * Find duplicate notes by note type and field
   */
  @Post('/notes/find-duplicates')
  async findDuplicates(@Body() dto: FindDuplicatesDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const duplicates = await this.echoeDuplicateService.findDuplicates(userDto.uid, dto);
      return ResponseUtil.success(duplicates);
    } catch (error) {
      logger.error('Find duplicates error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/notes/merge-duplicates
   * Merge duplicates: keep one note, delete others
   */
  @Post('/notes/merge-duplicates')
  async mergeDuplicates(@Body() dto: MergeDuplicatesDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      await this.echoeDuplicateService.mergeDuplicates(userDto.uid, dto);
      return ResponseUtil.success({ success: true });
    } catch (error) {
      logger.error('Merge duplicates error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
