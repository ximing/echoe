import {
  mysqlTable,
  int,
  varchar,
  text,
  tinyint,
  index,
  unique,
} from 'drizzle-orm/mysql-core';
import { echoeDeckConfig } from './echoe-deck-config.js';
import { echoeNotetypes } from './echoe-notetypes.js';

/**
 * Decks table - stores deck hierarchy
 * Mirrors Anki 2.1's decks table
 */
export const echoeDecks = mysqlTable(
  'echoe_decks',
  {
    id: int('id').primaryKey().notNull().autoincrement(), // Auto-increment internal primary key
    deckId: varchar('deck_id', { length: 191 }).notNull().unique(), // Business ID (nanoid string)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    name: varchar('name', { length: 191 }).notNull(), // Deck name (supports '::' for sub-decks)
    conf: varchar('conf', { length: 191 }).notNull(), // Deck config ID - business ID string
    extendNew: int('extend_new').notNull().default(20), // Extend new cards limit
    extendRev: int('extend_rev').notNull().default(200), // Extend review limit
    usn: int('usn').notNull(), // Update sequence number (sync)
    lim: int('lim').notNull().default(0), // Daily limit (deprecated, use deck config)
    collapsed: tinyint('collapsed').notNull().default(0), // Whether deck is collapsed in UI
    dyn: tinyint('dyn').notNull().default(0), // 0 = normal deck, 1 = filtered deck
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    desc: text('desc').notNull().$type<string>(), // Deck description
    mid: varchar('mid', { length: 191 }), // Last note type used - business ID string (nullable)
  },
  (table) => ({
    nameIdx: index('name_idx').on(table.name),
    usnIdx: index('usn_idx').on(table.usn),
    uidDeckIdIdx: index('uid_deck_id_idx').on(table.uid, table.deckId),
    uidNameUnique: unique('uid_name_unique').on(table.uid, table.name),
  })
);

export type EchoeDecks = typeof echoeDecks.$inferSelect;
export type NewEchoeDecks = typeof echoeDecks.$inferInsert;
