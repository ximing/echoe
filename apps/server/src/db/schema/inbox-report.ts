import {
  mysqlTable,
  varchar,
  text,
  bigint,
  timestamp,
  index,
  unique,
  int,
} from 'drizzle-orm/mysql-core';

/**
 * Inbox Report table - stores daily inbox reports with markdown content and structured summary
 * Each user can have one report per day (unique constraint on uid + date)
 * Used for AI retrieval of summarized inbox activity
 */
export const inboxReport = mysqlTable(
  'inbox_report',
  {
    id: int('id').primaryKey().autoincrement(), // Auto-increment primary key
    inboxReportId: varchar('inbox_report_id', { length: 191 })
      .notNull(), // Business ID (nanoid with 'ir' prefix)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID (owner of this report)
    date: varchar('date', { length: 20 }).notNull(), // Report date (YYYY-MM-DD format)
    content: text('content').notNull().$type<string>(), // Markdown content of the report
    summary: text('summary').$type<string>(), // Structured AI summary (JSON string)
    deletedAt: bigint('deleted_at', { mode: 'number' }).default(0).notNull(), // Soft delete timestamp (0 = not deleted, >0 = deleted)
    createdAt: timestamp('created_at', { mode: 'date', fsp: 3 })
      .notNull()
      .defaultNow(), // Report creation time
    updatedAt: timestamp('updated_at', { mode: 'date', fsp: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()), // Last update time
  },
  (table) => ({
    inboxReportIdUnique: unique('inbox_report_id_unique').on(
      table.inboxReportId
    ), // Unique constraint on business ID
    uidDateUnique: unique('uid_date_unique').on(table.uid, table.date), // One report per user per day
    uidIdx: index('uid_idx').on(table.uid), // Query reports by user
    dateIdx: index('date_idx').on(table.date), // Query reports by date
  })
);

export type InboxReport = typeof inboxReport.$inferSelect;
export type NewInboxReport = typeof inboxReport.$inferInsert;
