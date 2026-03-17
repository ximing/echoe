import {
  mysqlTable,
  varchar,
  timestamp,
  int,
  unique,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Inbox Category table - stores user-defined category values for inbox items
 * Replaces fixed enum with dynamic user-created values
 */
export const inboxCategory = mysqlTable(
  'inbox_category',
  {
    id: int('id').primaryKey().autoincrement(), // Auto-increment primary key
    uid: varchar('uid', { length: 191 }).notNull(), // User ID (owner of this category)
    name: varchar('name', { length: 191 }).notNull(), // Category name (e.g., 'backend', 'frontend', 'design')
    createdAt: timestamp('created_at', { mode: 'date', fsp: 3 }).notNull().defaultNow(), // Creation time
    updatedAt: timestamp('updated_at', { mode: 'date', fsp: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()), // Last update time
  },
  (table) => ({
    uidNameUnique: unique('uid_name_unique').on(table.uid, table.name), // Unique constraint on (uid, name)
    uidIdx: index('uid_idx').on(table.uid), // Query categories by user
  })
);

export type InboxCategory = typeof inboxCategory.$inferSelect;
export type NewInboxCategory = typeof inboxCategory.$inferInsert;
