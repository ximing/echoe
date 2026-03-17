import {
  mysqlTable,
  varchar,
  timestamp,
  int,
  unique,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Inbox Source table - stores user-defined source values for inbox items
 * Replaces fixed enum with dynamic user-created values
 */
export const inboxSource = mysqlTable(
  'inbox_source',
  {
    id: int('id').primaryKey().autoincrement(), // Auto-increment primary key
    uid: varchar('uid', { length: 191 }).notNull(), // User ID (owner of this source)
    name: varchar('name', { length: 191 }).notNull(), // Source name (e.g., 'manual', 'web', 'api')
    createdAt: timestamp('created_at', { mode: 'date', fsp: 3 }).notNull().defaultNow(), // Creation time
    updatedAt: timestamp('updated_at', { mode: 'date', fsp: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()), // Last update time
  },
  (table) => ({
    uidNameUnique: unique('uid_name_unique').on(table.uid, table.name), // Unique constraint on (uid, name)
    uidIdx: index('uid_idx').on(table.uid), // Query sources by user
  })
);

export type InboxSource = typeof inboxSource.$inferSelect;
export type NewInboxSource = typeof inboxSource.$inferInsert;
