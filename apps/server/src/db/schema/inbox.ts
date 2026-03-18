import {
  mysqlTable,
  varchar,
  json,
  boolean,
  bigint,
  timestamp,
  index,
  unique,
  int,
} from 'drizzle-orm/mysql-core';
import type { ProseMirrorJsonDoc } from '../../types/note-fields.js';

/**
 * Inbox table - stores captured content with read state and source metadata
 * Used for storing items that can be processed, converted to cards, or organized
 */
export const inbox = mysqlTable(
  'inbox',
  {
    id: int('id').primaryKey().autoincrement(), // Auto-increment primary key
    inboxId: varchar('inbox_id', { length: 191 }).notNull(), // Business ID (nanoid with 'i' prefix)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID (owner of this inbox item)
    front: json('front').notNull().$type<ProseMirrorJsonDoc | string>(), // Front side/question content (TipTap JSON or plain text)
    back: json('back').$type<ProseMirrorJsonDoc | string>(), // Back side/answer content (TipTap JSON or plain text)
    source: varchar('source', { length: 191 }), // Source of the item - dynamic user-defined value
    category: varchar('category', { length: 191 }), // Category/tag for organizing - dynamic user-defined value
    isRead: boolean('is_read').default(false).notNull(), // Read state (false = unread, true = read)
    deletedAt: bigint('deleted_at', { mode: 'number' }).default(0).notNull(), // Soft delete timestamp (0 = not deleted, >0 = deleted)
    createdAt: timestamp('created_at', { mode: 'date', fsp: 3 }).notNull().defaultNow(), // Item creation time
    updatedAt: timestamp('updated_at', { mode: 'date', fsp: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()), // Last update time
  },
  (table) => ({
    inboxIdUnique: unique('inbox_id_unique').on(table.inboxId), // Unique constraint on business ID
    uidIdx: index('uid_idx').on(table.uid), // Query inbox items by user
    categoryIdx: index('category_idx').on(table.category), // Filter by category
    isReadIdx: index('is_read_idx').on(table.isRead), // Filter by read state
    uidIsReadIdx: index('uid_is_read_idx').on(table.uid, table.isRead), // Query unread items for user
    uidCategoryIdx: index('uid_category_idx').on(table.uid, table.category), // Query by user and category
    deletedAtIdx: index('deleted_at_idx').on(table.deletedAt), // Filter for soft deletes
  })
);

export type Inbox = typeof inbox.$inferSelect;
export type NewInbox = typeof inbox.$inferInsert;
