import {
  mysqlTable,
  bigint,
  int,
  varchar,
  text,
  tinyint,
  index,
  unique,
} from 'drizzle-orm/mysql-core';

/**
 * Decks table - stores deck hierarchy
 * Mirrors Anki 2.1's decks table
 */
export const echoeDecks = mysqlTable(
  'echoe_decks',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().notNull(), // Deck ID (Unix timestamp in ms)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    name: varchar('name', { length: 191 }).notNull(), // Deck name (supports '::' for sub-decks)
    conf: bigint('conf', { mode: 'number' }).notNull().default(1), // Deck config ID
    extendNew: int('extend_new').notNull().default(20), // Extend new cards limit
    extendRev: int('extend_rev').notNull().default(200), // Extend review limit
    usn: int('usn').notNull(), // Update sequence number (sync)
    lim: int('lim').notNull().default(0), // Daily limit (deprecated, use deck config)
    collapsed: tinyint('collapsed').notNull().default(0), // Whether deck is collapsed in UI
    dyn: tinyint('dyn').notNull().default(0), // 0 = normal deck, 1 = filtered deck
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    desc: text('desc').notNull().$type<string>(), // Deck description
    mid: bigint('mid', { mode: 'number' }).notNull().default(0), // Last note type used
  },
  (table) => ({
    nameIdx: index('name_idx').on(table.name),
    usnIdx: index('usn_idx').on(table.usn),
    uidNameUnique: unique('uid_name_unique').on(table.uid, table.name),
  })
);

export type EchoeDecks = typeof echoeDecks.$inferSelect;
export type NewEchoeDecks = typeof echoeDecks.$inferInsert;
