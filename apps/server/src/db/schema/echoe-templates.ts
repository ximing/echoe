import {
  mysqlTable,
  bigint,
  int,
  varchar,
  text,
  index,
  unique,
} from 'drizzle-orm/mysql-core';

/**
 * Templates table - stores card templates for note types
 * Mirrors Anki 2.1's templates table
 * Note: In Anki 2.1, templates are stored as JSON within notetypes.tmpls
 * This table provides a normalized alternative for easier querying
 */
export const echoeTemplates = mysqlTable(
  'echoe_templates',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().notNull(), // Template ID
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    ntid: bigint('ntid', { mode: 'number' }).notNull(), // Note type ID
    name: varchar('name', { length: 191 }).notNull(), // Template name
    ord: int('ord').notNull(), // Template ordinal (0-based)
    qfmt: text('qfmt').notNull().$type<string>(), // Question format (front side)
    afmt: text('afmt').notNull().$type<string>(), // Answer format (back side)
    bqfmt: text('bqfmt').notNull().$type<string>(), // Browser question format
    bafmt: text('bafmt').notNull().$type<string>(), // Browser answer format
    did: bigint('did', { mode: 'number' }).notNull().default(0), // Override deck ID
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    usn: int('usn').notNull(), // Update sequence number (sync)
  },
  (table) => ({
    ntidIdx: index('ntid_idx').on(table.ntid),
    ordIdx: index('ord_idx').on(table.ord),
    usnIdx: index('usn_idx').on(table.usn),
    uidNtidOrdUnique: unique('uid_ntid_ord_unique').on(table.uid, table.ntid, table.ord),
  })
);

export type EchoeTemplates = typeof echoeTemplates.$inferSelect;
export type NewEchoeTemplates = typeof echoeTemplates.$inferInsert;
