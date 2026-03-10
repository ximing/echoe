import {
  mysqlTable,
  bigint,
  int,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Collection table - stores Anki application state
 * Mirrors Anki 2.1's col table
 */
export const echoeCol = mysqlTable(
  'echoe_col',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().notNull(), // Creation time (Unix timestamp in ms)
    crt: int('crt').notNull(), // Day that the collection was created (Unix timestamp in seconds, midnight local)
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    scm: int('scm').notNull(), // Schema modified time (Unix timestamp in seconds)
    ver: int('ver').notNull(), // Version number
    dty: int('dty').notNull(), // Database type (unused in Anki)
    usn: int('usn').notNull(), // Update sequence number (sync)
    ls: bigint('ls', { mode: 'number' }).notNull(), // Last sync time (Unix timestamp in seconds)
    conf: text('conf').notNull().$type<string>(), // JSON object with configuration
    models: text('models').notNull().$type<string>(), // JSON object with note types
    decks: text('decks').notNull().$type<string>(), // JSON object with decks
    dconf: text('dconf').notNull().$type<string>(), // JSON object with deck configs
    tags: text('tags').notNull().$type<string>(), // JSON object with tags
  },
  (table) => ({
    usnIdx: index('usn_idx').on(table.usn),
  })
);

export type EchoeCol = typeof echoeCol.$inferSelect;
export type NewEchoeCol = typeof echoeCol.$inferInsert;
