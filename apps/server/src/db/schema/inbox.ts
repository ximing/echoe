import {
  mysqlTable,
  varchar,
  text,
  boolean,
  bigint,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/mysql-core';

/**
 * Inbox table - stores captured content with read state and source metadata
 * Used for storing items that can be processed, converted to cards, or organized
 */
export const inbox = mysqlTable(
  'inbox',
  {
    inboxId: varchar('inbox_id', { length: 191 }).primaryKey().notNull(), // Business ID (nanoid with 'i' prefix)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID (owner of this inbox item)
    front: text('front').notNull().$type<string>(), // Front side/question content
    back: text('back').notNull().$type<string>(), // Back side/answer content
    source: varchar('source', { length: 255 }).notNull().default('manual'), // Source of the item (e.g., 'manual', 'web', 'api')
    category: varchar('category', { length: 255 }).notNull().default('backend'), // Category/tag for organizing (e.g., 'backend', 'frontend', 'design')
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
