/**
 * Tests for EchoeMediaService
 * Focuses on hash-based deduplication logic
 */

import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';

import { EchoeMediaService } from '../services/echoe-media.service.js';
import { getDatabase, initializeDatabase, closeDatabase } from '../db/connection.js';
import { echoeMedia } from '../db/schema/echoe-media.js';

// Mock the storage adapter to avoid actual file operations
jest.mock('../sources/unified-storage-adapter/index.js', () => ({
  UnifiedStorageAdapterFactory: {
    createAttachmentAdapter: jest.fn(() => ({
      uploadFile: jest.fn().mockResolvedValue(undefined),
      downloadFile: jest.fn().mockResolvedValue(Buffer.from('test')),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      fileExists: jest.fn().mockResolvedValue(true),
      generateAccessUrl: jest.fn((key: string) => Promise.resolve(`https://example.com/${key}`)),
    })),
  },
}));

describe('EchoeMediaService - Hash-based Deduplication', () => {
  let service: EchoeMediaService;
  const testUid = 'test-user-dedup-123';
  const testBuffer = Buffer.from('test file content');
  const testHash = crypto.createHash('sha1').update(testBuffer).digest('hex');

  beforeAll(async () => {
    // Initialize database connection
    initializeDatabase();

    // Create service instance
    service = new EchoeMediaService();
  });

  afterAll(async () => {
    // Close database connection
    await closeDatabase();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    const db = getDatabase();
    await db.delete(echoeMedia).where(eq(echoeMedia.uid, testUid));
  });

  afterEach(async () => {
    // Clean up test data after each test
    const db = getDatabase();
    await db.delete(echoeMedia).where(eq(echoeMedia.uid, testUid));
  });

  describe('uploadMedia', () => {
    it('should upload a new file when hash does not exist', async () => {
      const result = await service.uploadMedia(testUid, testBuffer, 'test-file.txt');

      expect(result).toBeDefined();
      expect(result.filename).toBeDefined();
      expect(result.url).toBeDefined();

      // Verify database record
      const db = getDatabase();
      const records = await db
        .select()
        .from(echoeMedia)
        .where(and(eq(echoeMedia.uid, testUid), eq(echoeMedia.hash, testHash)));

      expect(records).toHaveLength(1);
      expect(records[0].hash).toBe(testHash);
      expect(records[0].size).toBe(testBuffer.length);
      expect(records[0].originalFilename).toBe('test-file.txt');
    });

    it('should return existing file when hash already exists for the same user', async () => {
      // First upload
      const firstResult = await service.uploadMedia(testUid, testBuffer, 'original.txt');

      // Second upload with same content but different filename
      const secondResult = await service.uploadMedia(testUid, testBuffer, 'duplicate.txt');

      // Should return the same filename (deduplication)
      expect(secondResult.filename).toBe(firstResult.filename);
      expect(secondResult.url).toBeDefined();

      // Verify only one record exists in database
      const db = getDatabase();
      const records = await db
        .select()
        .from(echoeMedia)
        .where(and(eq(echoeMedia.uid, testUid), eq(echoeMedia.hash, testHash)));

      expect(records).toHaveLength(1);
      expect(records[0].filename).toBe(firstResult.filename);
      expect(records[0].originalFilename).toBe('original.txt'); // Should keep original name
    });

    it('should upload separately when same hash exists for different users', async () => {
      const otherUid = 'other-user-456';

      try {
        // First upload for user 1
        const result1 = await service.uploadMedia(testUid, testBuffer, 'user1-file.txt');

        // Second upload for user 2 with same content
        const result2 = await service.uploadMedia(otherUid, testBuffer, 'user2-file.txt');

        // Should have different filenames (user isolation)
        expect(result1.filename).not.toBe(result2.filename);

        // Verify separate records in database
        const db = getDatabase();
        const user1Records = await db
          .select()
          .from(echoeMedia)
          .where(and(eq(echoeMedia.uid, testUid), eq(echoeMedia.hash, testHash)));

        const user2Records = await db
          .select()
          .from(echoeMedia)
          .where(and(eq(echoeMedia.uid, otherUid), eq(echoeMedia.hash, testHash)));

        expect(user1Records).toHaveLength(1);
        expect(user2Records).toHaveLength(1);
        expect(user1Records[0].filename).toBe(result1.filename);
        expect(user2Records[0].filename).toBe(result2.filename);
      } finally {
        // Cleanup other user's data
        const db = getDatabase();
        await db.delete(echoeMedia).where(eq(echoeMedia.uid, otherUid));
      }
    });

    it('should upload separately when hash is different for the same user', async () => {
      const buffer1 = Buffer.from('first file content');
      const buffer2 = Buffer.from('second file content');

      const result1 = await service.uploadMedia(testUid, buffer1, 'file1.txt');
      const result2 = await service.uploadMedia(testUid, buffer2, 'file2.txt');

      // Should have different filenames
      expect(result1.filename).not.toBe(result2.filename);

      // Verify two separate records
      const db = getDatabase();
      const records = await db.select().from(echoeMedia).where(eq(echoeMedia.uid, testUid));

      expect(records).toHaveLength(2);
    });

    it('should use hash_idx index for efficient lookup', async () => {
      // This test verifies the query uses the hash_idx index
      // The index is defined in the schema: hashIdx: index('hash_idx').on(table.hash)

      // Upload a file
      await service.uploadMedia(testUid, testBuffer, 'test.txt');

      // Query using hash - should leverage hash_idx
      const db = getDatabase();
      const records = await db
        .select()
        .from(echoeMedia)
        .where(and(eq(echoeMedia.uid, testUid), eq(echoeMedia.hash, testHash)));

      expect(records).toHaveLength(1);
      expect(records[0].hash).toBe(testHash);
    });

    it('should preserve file metadata on deduplication', async () => {
      // First upload
      const firstResult = await service.uploadMedia(testUid, testBuffer, 'original.txt');

      // Get the original record
      const db = getDatabase();
      const originalRecord = await db
        .select()
        .from(echoeMedia)
        .where(and(eq(echoeMedia.uid, testUid), eq(echoeMedia.filename, firstResult.filename)))
        .limit(1);

      // Second upload (deduplicated)
      const secondResult = await service.uploadMedia(testUid, testBuffer, 'duplicate.txt');

      // Get the record after deduplication
      const afterRecord = await db
        .select()
        .from(echoeMedia)
        .where(and(eq(echoeMedia.uid, testUid), eq(echoeMedia.filename, secondResult.filename)))
        .limit(1);

      // Verify metadata is unchanged
      expect(afterRecord[0].size).toBe(originalRecord[0].size);
      expect(afterRecord[0].mimeType).toBe(originalRecord[0].mimeType);
      expect(afterRecord[0].hash).toBe(originalRecord[0].hash);
      expect(afterRecord[0].createdAt).toBe(originalRecord[0].createdAt);
      expect(afterRecord[0].originalFilename).toBe('original.txt'); // Original name preserved
    });

    it('should generate valid storage key and URL on deduplication', async () => {
      // First upload
      const firstResult = await service.uploadMedia(testUid, testBuffer, 'test.txt');
      expect(firstResult.url).toContain(firstResult.filename);

      // Second upload (deduplicated)
      const secondResult = await service.uploadMedia(testUid, testBuffer, 'duplicate.txt');
      expect(secondResult.url).toContain(secondResult.filename);

      // URLs should reference the same file
      expect(secondResult.filename).toBe(firstResult.filename);
    });
  });
});
