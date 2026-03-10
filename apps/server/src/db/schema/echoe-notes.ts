import {
  mysqlTable,
  bigint,
  int,
  varchar,
  text,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Notes table - stores flashcard content (notes)
 * Mirrors Anki 2.1's notes table
 */
export const echoeNotes = mysqlTable(
  'echoe_notes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().notNull(), // Unique ID (Unix timestamp in ms * 1000 + random)
    guid: varchar('guid', { length: 191 }).notNull(), // Globally unique ID for sync (40 char hex string)
    mid: bigint('mid', { mode: 'number' }).notNull(), // Model ID (note type ID)
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    usn: int('usn').notNull(), // Update sequence number (sync)
    tags: text('tags').notNull().$type<string>(), // JSON array of tags
    flds: text('flds').notNull(), // Field values (joined by \x1f)
    sfld: varchar('sfld', { length: 191 }).notNull(), // Sort field (first field, cleaned)
    csum: bigint('csum', { mode: 'number' }).notNull(), // Checksum of sort field (for duplicates)
    flags: int('flags').notNull().default(0), // Flags (1 = marked)
    data: text('data').notNull().$type<string>(), // Extra data field (JSON)
  },
  (table) => ({
    guidIdx: index('guid_idx').on(table.guid),
    midIdx: index('mid_idx').on(table.mid),
    usnIdx: index('usn_idx').on(table.usn),
    sfldIdx: index('sfld_idx').on(table.sfld),
  })
);

export type EchoeNotes = typeof echoeNotes.$inferSelect;
export type NewEchoeNotes = typeof echoeNotes.$inferInsert;
