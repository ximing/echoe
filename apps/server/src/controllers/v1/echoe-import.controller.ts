/**
 * Echoe Import Controller
 * Handles importing .apkg files
 */

import multer from 'multer';
import { JsonController, Post, Req, UseBefore } from 'routing-controllers';
import { Service, Inject } from 'typedi';
import type { Request } from 'express';

import { config } from '../../config/config.js';
import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeImportService } from '../../services/echoe-import.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type { ImportResultDto } from '@echoe/dto';

// Max file size: 500MB
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// Multer middleware for .apkg file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_request, file, callback) => {
    // Only allow .apkg files
    if (file.originalname.endsWith('.apkg')) {
      callback(null, true);
    } else {
      callback(new Error('Only .apkg files are allowed'));
    }
  },
});

@Service()
@JsonController('/api/v1/import')
export class EchoeImportController {
  constructor(@Inject(() => EchoeImportService) private importService: EchoeImportService) {}

  /**
   * POST /api/v1/import/apkg
   * Import an .apkg file
   */
  @Post('/apkg')
  @UseBefore(upload.single('file'))
  async importApkg(@Req() request: Request) {
    return new Promise((resolve) => {
      upload.single('file')(request, {} as any, async (error: any) => {
        if (error) {
          if (error.message === 'Only .apkg files are allowed') {
            return resolve(ResponseUtil.error(ErrorCode.UNSUPPORTED_FILE_TYPE));
          }
          if (error.message.includes('File too large')) {
            return resolve(ResponseUtil.error(ErrorCode.FILE_TOO_LARGE));
          }
          logger.error('APKG upload error:', error);
          return resolve(ResponseUtil.error(ErrorCode.FILE_UPLOAD_ERROR));
        }

        const file = (request as any).file;
        if (!file) {
          return resolve(ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'No file uploaded'));
        }

        try {
          const result: ImportResultDto = await this.importService.importApkg(file.buffer);
          return resolve(ResponseUtil.success(result));
        } catch (error) {
          logger.error('Failed to import .apkg:', error);
          return resolve(ResponseUtil.error(ErrorCode.DB_ERROR));
        }
      });
    });
  }
}
