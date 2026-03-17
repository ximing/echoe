/**
 * Echoe Media Service
 * Manages media files for Echoe cards
 */

import crypto from 'crypto';
import { Service } from 'typedi';
import { eq, inArray, and } from 'drizzle-orm';

import { getDatabase } from '../db/connection.js';
import { echoeMedia } from '../db/schema/echoe-media.js';
import { echoeNotes } from '../db/schema/echoe-notes.js';
import { config } from '../config/config.js';
import { UnifiedStorageAdapterFactory } from '../sources/unified-storage-adapter/index.js';
import { logger } from '../utils/logger.js';
import { generateTypeId } from '../utils/id.js';
import { OBJECT_TYPE } from '../models/constant/type.js';

import type { UnifiedStorageAdapter } from '../sources/unified-storage-adapter/index.js';
import type {
  EchoeMediaDto,
  UploadMediaResultDto,
  CheckUnusedMediaResultDto,
} from '@echoe/dto';

// Storage path prefix for Echoe media files
const MEDIA_STORAGE_PREFIX = 'echoe-media';

@Service()
export class EchoeMediaService {
  private storageAdapter: UnifiedStorageAdapter;

  constructor() {
    this.storageAdapter = UnifiedStorageAdapterFactory.createAttachmentAdapter(config.attachment);
  }

  /**
   * Get storage metadata for URL generation
   */
  private getStorageMetadata(): {
    bucket?: string;
    prefix?: string;
    endpoint?: string;
    region?: string;
    isPublicBucket?: string;
  } {
    const attachmentConfig = config.attachment;
    const storageType = attachmentConfig.storageType;

    switch (storageType) {
      case 's3': {
        return {
          bucket: attachmentConfig.s3?.bucket,
          prefix: attachmentConfig.s3?.prefix,
          endpoint: attachmentConfig.s3?.endpoint,
          region: attachmentConfig.s3?.region,
          isPublicBucket: attachmentConfig.s3?.isPublic ? 'true' : 'false',
        };
      }
      case 'oss': {
        return {
          bucket: attachmentConfig.oss?.bucket,
          prefix: attachmentConfig.oss?.prefix,
          endpoint: attachmentConfig.oss?.endpoint,
          region: attachmentConfig.oss?.region,
          isPublicBucket: attachmentConfig.oss?.isPublic ? 'true' : 'false',
        };
      }
      default:
        return {};
    }
  }

  /**
   * Upload a media file
   * Returns the stored filename and URL
   */
  async uploadMedia(uid: string, buffer: Buffer, originalFilename: string): Promise<UploadMediaResultDto> {
    // Generate unique filename using timestamp + hash
    const timestamp = Date.now();
    const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 8);
    const extension = originalFilename.split('.').pop() || '';
    const storedFilename = `${timestamp}-${hash}.${extension}`;

    // Generate hash for the file
    const fileHash = crypto.createHash('sha1').update(buffer).digest('hex');

    // Determine MIME type from extension
    const mimeType = this.getMimeType(extension);

    // Upload to storage with uid namespace: echoe-media/<uid>/<filename>
    const storageKey = `${MEDIA_STORAGE_PREFIX}/${uid}/${storedFilename}`;
    await this.storageAdapter.uploadFile(storageKey, buffer);

    // Generate URL
    const url = await this.storageAdapter.generateAccessUrl(storageKey, this.getStorageMetadata());

    // Save to database
    const db = getDatabase();
    const mediaId = generateTypeId(OBJECT_TYPE.ECHOE_MEDIA);
    await db.insert(echoeMedia).values({
      uid,
      mediaId,
      filename: storedFilename,
      originalFilename,
      size: buffer.length,
      mimeType,
      hash: fileHash,
      storageKey, // Save storage key for dynamic URL generation
      createdAt: Math.floor(Date.now() / 1000),
      usedInCards: 0,
    });

    return { filename: storedFilename, url };
  }

  /**
   * Get media metadata by filename
   * Returns media metadata with dynamically generated access URL
   * Validates that the user owns the media file
   */
  async getMediaMetadata(uid: string, filename: string): Promise<EchoeMediaDto | null> {
    const db = getDatabase();

    try {
      const mediaRecord = await db
        .select()
        .from(echoeMedia)
        .where(and(eq(echoeMedia.uid, uid), eq(echoeMedia.filename, filename)))
        .limit(1);

      if (mediaRecord.length === 0) {
        logger.warn(`Media not found: uid=${uid}, filename=${filename}`);
        return null;
      }

      const record = mediaRecord[0];
      let url: string | undefined;

      // Generate temporary access URL if storageKey exists
      if (record.storageKey) {
        try {
          url = await this.storageAdapter.generateAccessUrl(record.storageKey, this.getStorageMetadata());
        } catch (error) {
          logger.warn(`Failed to generate access URL for ${record.filename}:`, error);
        }
      }

      return {
        id: record.mediaId,
        filename: record.filename,
        originalFilename: record.originalFilename,
        size: record.size,
        mimeType: record.mimeType,
        hash: record.hash,
        createdAt: record.createdAt,
        usedInCards: Boolean(record.usedInCards),
        storageKey: record.storageKey,
        url,
      };
    } catch (error) {
      logger.error('Error getting media metadata:', error);
      return null;
    }
  }

  /**
   * Get a media file by filename
   * Returns the file buffer and content type
   * Validates that the user owns the media file
   */
  async getMedia(uid: string, filename: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const db = getDatabase();

    try {
      // Validate that the media file belongs to the user
      const mediaRecord = await db
        .select()
        .from(echoeMedia)
        .where(and(eq(echoeMedia.uid, uid), eq(echoeMedia.filename, filename)))
        .limit(1);

      if (mediaRecord.length === 0) {
        logger.warn(`Media access denied: uid=${uid}, filename=${filename}`);
        return null;
      }

      // Use uid-namespaced storage key: echoe-media/<uid>/<filename>
      const storageKey = `${MEDIA_STORAGE_PREFIX}/${uid}/${filename}`;

      const exists = await this.storageAdapter.fileExists(storageKey);
      if (!exists) {
        return null;
      }

      const buffer = await this.storageAdapter.downloadFile(storageKey);
      const extension = filename.split('.').pop() || '';
      const contentType = this.getMimeType(extension);

      return { buffer, contentType };
    } catch (error) {
      logger.error('Error getting media file:', error);
      return null;
    }
  }

  /**
   * List all media files for the current user
   */
  async listMedia(uid: string): Promise<EchoeMediaDto[]> {
    const db = getDatabase();
    const results = await db.select().from(echoeMedia).where(eq(echoeMedia.uid, uid));

    // Generate temporary access URLs for each media file
    const mediaWithUrls = await Promise.all(
      results.map(async (row: {
        id: number;
        mediaId: string;
        filename: string;
        originalFilename: string;
        size: number;
        mimeType: string;
        hash: string;
        storageKey: string | null;
        createdAt: number;
        usedInCards: number;
      }) => {
        let url: string | undefined;

        // Generate temporary access URL if storageKey exists
        if (row.storageKey) {
          try {
            url = await this.storageAdapter.generateAccessUrl(row.storageKey, this.getStorageMetadata());
          } catch (error) {
            logger.warn(`Failed to generate access URL for ${row.filename}:`, error);
          }
        }

        return {
          id: row.mediaId,
          filename: row.filename,
          originalFilename: row.originalFilename,
          size: row.size,
          mimeType: row.mimeType,
          hash: row.hash,
          createdAt: row.createdAt,
          usedInCards: Boolean(row.usedInCards),
          url,
        };
      })
    );

    return mediaWithUrls;
  }

  /**
   * Check for unused media files for the current user
   * Scans all note fields for media references
   */
  async checkUnusedMedia(uid: string): Promise<CheckUnusedMediaResultDto> {
    const db = getDatabase();

    // Get all notes for the current user with their field data
    const notes = await db
      .select({ flds: echoeNotes.flds })
      .from(echoeNotes)
      .where(eq(echoeNotes.uid, uid));

    // Extract all media references from note fields
    const referencedFiles = new Set<string>();

    // Pattern to match [sound:filename.mp3] and <img src="...">
    const soundPattern = /\[sound:([^\]]+)\]/g;
    const imgPattern = /<img[^>]+src=["']([^"']+)["']/g;

    for (const note of notes) {
      const flds = note.flds || '';
      let match;

      // Find [sound:filename] references
      while ((match = soundPattern.exec(flds)) !== null) {
        referencedFiles.add(match[1]);
      }

      // Find <img src="..."> references
      while ((match = imgPattern.exec(flds)) !== null) {
        const src = match[1];
        // Extract filename from URL path
        const filename = src.split('/').pop() || src;
        referencedFiles.add(filename);
      }
    }

    // Get all media files for the current user from database
    const allMedia = await db
      .select({ filename: echoeMedia.filename })
      .from(echoeMedia)
      .where(eq(echoeMedia.uid, uid));

    // Find files that are not referenced
    const unusedFiles = allMedia
      .map((m: { filename: string }) => m.filename)
      .filter((filename: string) => !referencedFiles.has(filename));

    return { unusedFiles };
  }

  /**
   * Delete media files in bulk for the current user
   */
  async deleteBulk(uid: string, filenames: string[]): Promise<void> {
    const db = getDatabase();

    // Verify all files belong to the user before deleting
    const ownedFiles = await db
      .select({ filename: echoeMedia.filename })
      .from(echoeMedia)
      .where(and(eq(echoeMedia.uid, uid), inArray(echoeMedia.filename, filenames)));

    const ownedFilenames = ownedFiles.map((f: { filename: string }) => f.filename);

    // Delete from storage (only files owned by the user)
    for (const filename of ownedFilenames) {
      const storageKey = `${MEDIA_STORAGE_PREFIX}/${uid}/${filename}`;
      try {
        const exists = await this.storageAdapter.fileExists(storageKey);
        if (exists) {
          await this.storageAdapter.deleteFile(storageKey);
        }
      } catch (error) {
        logger.warn(`Failed to delete media file from storage: ${filename}`, error);
      }
    }

    // Delete from database (only files owned by the user)
    if (ownedFilenames.length > 0) {
      await db
        .delete(echoeMedia)
        .where(and(eq(echoeMedia.uid, uid), inArray(echoeMedia.filename, ownedFilenames)));
    }
  }

  /**
   * Mark media as used in cards for the current user
   */
  async markAsUsed(uid: string, filenames: string[]): Promise<void> {
    if (filenames.length === 0) return;

    const db = getDatabase();
    await db
      .update(echoeMedia)
      .set({ usedInCards: 1 })
      .where(and(eq(echoeMedia.uid, uid), inArray(echoeMedia.filename, filenames)));
  }

  /**
   * Get MIME type from file extension
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      mp4: 'video/mp4',
      webm: 'video/webm',
      pdf: 'application/pdf',
    };
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }
}
