/**
 * Echoe Export Controller
 * Handles exporting decks to .apkg files
 */

import { JsonController, Get, QueryParam, Res, CurrentUser } from 'routing-controllers';
import { Service, Inject } from 'typedi';

import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeExportService, ExportOptions } from '../../services/echoe-export.service.js';
import { logger } from '../../utils/logger.js';
import type { Response } from 'express';
import type { UserInfoDto } from '@echoe/dto';

@Service()
@JsonController('/api/v1/export')
export class EchoeExportController {
  constructor(@Inject(() => EchoeExportService) private exportService: EchoeExportService) {}

  /**
   * GET /api/v1/export/apkg
   * Export a deck to .apkg format
   */
  @Get('/apkg')
  async exportApkg(
    @QueryParam('deckId') deckId?: number,
    @QueryParam('includeScheduling') includeScheduling?: string,
    @QueryParam('format') format?: string,
    @Res() res?: Response,
    @CurrentUser() userDto?: UserInfoDto
  ): Promise<void> {
    try {
      if (!userDto?.uid) {
        res?.status(401).send('Unauthorized');
        return;
      }

      const includeSchedulingBool = includeScheduling === 'true';
      const formatValue = format === 'legacy' ? 'legacy' : 'anki';

      const options: ExportOptions = {
        deckId,
        includeScheduling: includeSchedulingBool,
        format: formatValue,
      };

      const result = await this.exportService.exportApkg(userDto.uid, options);

      // Set response headers for file download
      res?.setHeader('Content-Type', 'application/apkg');
      res?.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);

      return res?.send(result.buffer) as unknown as void;
    } catch (error) {
      logger.error('Failed to export .apkg:', error);
      throw ErrorCode.DB_ERROR;
    }
  }
}
