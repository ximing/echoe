import { JsonController, Post, Body } from 'routing-controllers';
import { Service } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeDuplicateService } from '../../services/echoe-duplicate.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type { FindDuplicatesDto, MergeDuplicatesDto } from '@echoe/dto';

@Service()
@JsonController('/api/v1')
export class EchoeDuplicateController {
  constructor(private echoeDuplicateService: EchoeDuplicateService) {}

  /**
   * POST /api/v1/notes/find-duplicates
   * Find duplicate notes by note type and field
   */
  @Post('/notes/find-duplicates')
  async findDuplicates(@Body() dto: FindDuplicatesDto) {
    try {
      const duplicates = await this.echoeDuplicateService.findDuplicates(dto);
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
  async mergeDuplicates(@Body() dto: MergeDuplicatesDto) {
    try {
      await this.echoeDuplicateService.mergeDuplicates(dto);
      return ResponseUtil.success({ success: true });
    } catch (error) {
      logger.error('Merge duplicates error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
