import {
  mysqlTable,
  int,
  varchar,
  tinyint,
  index,
  unique,
} from 'drizzle-orm/mysql-core';

/**
 * Media table - stores metadata for media files used in cards
 * Mirrors Anki 2.1's media table
 */
export const echoeMedia = mysqlTable(
  'echoe_media',
  {
    id: int('id').primaryKey().autoincrement(), // Auto-increment internal primary key
    mediaId: varchar('media_id', { length: 191 }).notNull().unique(), // Business ID (nanoid string)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    filename: varchar('filename', { length: 191 }).notNull(), // Stored filename
    originalFilename: varchar('original_filename', { length: 191 }).notNull(), // Original uploaded filename
    size: int('size').notNull(), // File size in bytes
    mimeType: varchar('mime_type', { length: 100 }).notNull(), // MIME type
    hash: varchar('hash', { length: 64 }).notNull(), // SHA1 hash of file
    createdAt: int('created_at').notNull(), // Creation timestamp (Unix timestamp in seconds)
    usedInCards: tinyint('used_in_cards').notNull().default(0), // Whether file is referenced in any card
  },
  (table) => ({
    filenameIdx: index('filename_idx').on(table.filename),
    hashIdx: index('hash_idx').on(table.hash),
    uidMediaIdIdx: index('uid_media_id_idx').on(table.uid, table.mediaId),
    uidFilenameUnique: unique('uid_filename_unique').on(table.uid, table.filename),
  })
);

export type EchoeMedia = typeof echoeMedia.$inferSelect;
export type NewEchoeMedia = typeof echoeMedia.$inferInsert;
