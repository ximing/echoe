/**
 * Echoe Import Controller
 * Handles importing .apkg files
 */

import multer from 'multer';
import { JsonController, Post, Req, CurrentUser, QueryParam } from 'routing-controllers';
import { Service, Inject } from 'typedi';
import type { Request, Response } from 'express';

import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeImportService } from '../../services/echoe-import.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type { ImportResultDto, UserInfoDto } from '@echoe/dto';

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

// Extend Express Request type to include file from multer
declare module 'express' {
  interface Request {
    file?: Express.Multer.File;
  }
}

const runSingleFileUpload = async (request: Request): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const response = request.res ?? ({} as Response);
    upload.single('file')(request, response, (error: unknown) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

@Service()
@JsonController('/api/v1/import')
export class EchoeImportController {
  constructor(@Inject(() => EchoeImportService) private importService: EchoeImportService) {}

  /**
   * POST /api/v1/import/apkg
   * Import an .apkg file
   * @query deckId - Optional deck ID to import all cards into
   * @query deckName - Optional deck name to use when creating new decks (instead of using APKG deck names)
   */
  @Post('/apkg')
  async importApkg(
    @Req() request: Request,
    @QueryParam('deckId') deckId?: string,
    @QueryParam('deckName') deckName?: string,
    @CurrentUser() userDto?: UserInfoDto
  ) {
    if (!userDto?.uid) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
    }

    try {
      await runSingleFileUpload(request);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Only .apkg files are allowed') {
        return ResponseUtil.error(ErrorCode.UNSUPPORTED_FILE_TYPE);
      }
      if (error instanceof Error && error.message.includes('File too large')) {
        return ResponseUtil.error(ErrorCode.FILE_TOO_LARGE);
      }
      logger.error('APKG upload error:', error);
      return ResponseUtil.error(ErrorCode.FILE_UPLOAD_ERROR);
    }

    const file = request.file;
    if (!file) {
      return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'No file uploaded');
    }

    try {
      const result: ImportResultDto = await this.importService.importApkg(userDto.uid, file.buffer, deckId, deckName);
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Failed to import .apkg:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
