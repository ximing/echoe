/**
 * Echoe Media Controller
 * Handles media file uploads and serving for cards
 */

import multer from 'multer';
import {
  JsonController,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  Res,
  CurrentUser,
} from 'routing-controllers';
import { Service, Inject } from 'typedi';
import type { Request, Response } from 'express';

import { config } from '../../config/config.js';
import { ErrorCode } from '../../constants/error-codes.js';
import { EchoeMediaService } from '../../services/echoe-media.service.js';
import { logger } from '../../utils/logger.js';
import { ResponseUtil } from '../../utils/response.js';

import type {
  DeleteMediaBulkDto,
  CheckUnusedMediaResultDto,
  UploadMediaResultDto,
  UserInfoDto,
} from '@echoe/dto';

// Multer middleware for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.attachment.maxFileSize,
  },
  fileFilter: (_request, file, callback) => {
    // Allow common media types
    const allowedMimes = [
      'image/',
      'audio/',
      'video/',
      'application/pdf',
    ];
    const isAllowed = allowedMimes.some((mime) => file.mimetype.startsWith(mime));
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Only media files (images, audio, video) and PDF are allowed'));
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
@JsonController('/api/v1/media')
export class EchoeMediaController {
  constructor(@Inject(() => EchoeMediaService) private mediaService: EchoeMediaService) {}

  /**
   * GET /api/v1/media
   * List all media files
   */
  @Get('/')
  async listMedia(@CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const media = await this.mediaService.listMedia();
      return ResponseUtil.success(media);
    } catch (error) {
      logger.error('List media error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * GET /api/v1/media/:filename
   * Serve a media file
   */
  @Get('/:filename')
  async getMedia(@Param('filename') filename: string, @Res() response: Response, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return response.status(401).send('Unauthorized');
      }

      // Decode filename
      const decodedFilename = decodeURIComponent(filename);

      const media = await this.mediaService.getMedia(decodedFilename);
      if (!media) {
        return response.status(404).send('File not found');
      }

      // Set content type
      response.setHeader('Content-Type', media.contentType);
      response.setHeader('Content-Length', media.buffer.length);

      // Set cache headers (1 day)
      response.setHeader('Cache-Control', 'public, max-age=86400');

      return response.send(media.buffer);
    } catch (error) {
      logger.error('Get media error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * POST /api/v1/media/upload
   * Upload a media file
   */
  @Post('/upload')
  async uploadMedia(@Req() request: Request, @CurrentUser() userDto?: UserInfoDto) {
    if (!userDto?.uid) {
      return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
    }

    try {
      await runSingleFileUpload(request);
    } catch (error: unknown) {
      if (
        error instanceof Error
        && error.message === 'Only media files (images, audio, video) and PDF are allowed'
      ) {
        return ResponseUtil.error(ErrorCode.UNSUPPORTED_FILE_TYPE);
      }
      if (error instanceof Error && error.message.includes('File too large')) {
        return ResponseUtil.error(ErrorCode.FILE_TOO_LARGE);
      }
      logger.error('Media upload error:', error);
      return ResponseUtil.error(ErrorCode.FILE_UPLOAD_ERROR);
    }

    const file = request.file;
    if (!file) {
      return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'No file uploaded');
    }

    try {
      const result: UploadMediaResultDto = await this.mediaService.uploadMedia(
        file.buffer,
        file.originalname
      );
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Failed to upload media:', error);
      return ResponseUtil.error(ErrorCode.STORAGE_ERROR);
    }
  }

  /**
   * POST /api/v1/media/check-unused
   * Check for unused media files
   */
  @Post('/check-unused')
  async checkUnusedMedia(@CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      const result: CheckUnusedMediaResultDto = await this.mediaService.checkUnusedMedia();
      return ResponseUtil.success(result);
    } catch (error) {
      logger.error('Check unused media error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }

  /**
   * DELETE /api/v1/media/bulk
   * Delete media files in bulk
   */
  @Delete('/bulk')
  async deleteBulk(@Body() dto: DeleteMediaBulkDto, @CurrentUser() userDto?: UserInfoDto) {
    try {
      if (!userDto?.uid) {
        return ResponseUtil.error(ErrorCode.UNAUTHORIZED);
      }

      if (!dto.filenames || dto.filenames.length === 0) {
        return ResponseUtil.error(ErrorCode.PARAMS_ERROR, 'No filenames provided');
      }

      await this.mediaService.deleteBulk(dto.filenames);
      return ResponseUtil.success({ message: 'Files deleted successfully' });
    } catch (error) {
      logger.error('Delete bulk media error:', error);
      return ResponseUtil.error(ErrorCode.DB_ERROR);
    }
  }
}
