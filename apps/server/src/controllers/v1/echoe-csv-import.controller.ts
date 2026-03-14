/**
 * Echoe CSV Import Controller
 * Handles CSV/TSV file upload for bulk flashcard import
 */

import multer from 'multer';
import { JsonController, Post, Req, CurrentUser } from 'routing-controllers';
import { Service, Inject } from 'typedi';
import type { Request, Response } from 'express';

import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeCsvImportService } from '../../services/echoe-csv-import.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type { CsvExecuteDto, UserInfoDto } from '@echoe/dto';

// Max file size: 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Multer middleware for CSV/TSV file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_request, file, callback) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')) {
      callback(null, true);
    } else {
      callback(new Error('Only .csv, .tsv, or .txt files are allowed'));
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
@JsonController('/api/v1/csv-import')
export class EchoeCsvImportController {
  constructor(
    @Inject(() => EchoeCsvImportService)
    private csvImportService: EchoeCsvImportService
  ) {}

  /**
   * POST /api/v1/csv-import/preview
   * Preview CSV file - detect encoding, delimiter, return first 5 rows
   */
  @Post('/preview')
  async previewCsv(@Req() request: Request, @CurrentUser() userDto?: UserInfoDto) {
    if (!userDto?.uid) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
    }

    try {
      await runSingleFileUpload(request);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('File too large')) {
        return ResponseUtil.error(ErrorCode.FILE_TOO_LARGE);
      }
      if (error instanceof Error && error.message.includes('Only .csv')) {
        return ResponseUtil.error(ErrorCode.UNSUPPORTED_FILE_TYPE);
      }
      logger.error('CSV preview upload error:', error);
      return ResponseUtil.error(ErrorCode.FILE_UPLOAD_ERROR);
    }

    const file = request.file;
    if (!file) {
      return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'No file uploaded');
    }

    try {
      const preview = await this.csvImportService.preview(file.buffer);
      return ResponseUtil.success(preview);
    } catch (err) {
      logger.error('Failed to preview CSV:', err);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/csv-import/execute
   * Execute CSV import with column mapping and target deck
   */
  @Post('/execute')
  async executeCsv(@Req() request: Request, @CurrentUser() userDto?: UserInfoDto) {
    if (!userDto?.uid) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
    }

    try {
      await runSingleFileUpload(request);
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('File too large')) {
        return ResponseUtil.error(ErrorCode.FILE_TOO_LARGE);
      }
      if (error instanceof Error && error.message.includes('Only .csv')) {
        return ResponseUtil.error(ErrorCode.UNSUPPORTED_FILE_TYPE);
      }
      logger.error('CSV execute upload error:', error);
      return ResponseUtil.error(ErrorCode.FILE_UPLOAD_ERROR);
    }

    const file = request.file;
    if (!file) {
      return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'No file uploaded');
    }

    const dto: CsvExecuteDto = request.body;
    if (!dto || dto.deckId === undefined || dto.notetypeId === undefined) {
      return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'Missing required parameters');
    }

    // Normalize types coerced from multipart form data
    const normalizedDto: CsvExecuteDto = {
      columnMapping: typeof dto.columnMapping === 'string'
        ? JSON.parse(dto.columnMapping)
        : dto.columnMapping,
      notetypeId: Number(dto.notetypeId),
      deckId: Number(dto.deckId),
      hasHeader: dto.hasHeader === true || (dto.hasHeader as any) === 'true',
    };

    try {
      const result = await this.csvImportService.execute(file.buffer, normalizedDto);
      return ResponseUtil.success(result);
    } catch (err) {
      logger.error('Failed to execute CSV import:', err);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
