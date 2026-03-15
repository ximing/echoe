import {
  mysqlTable,
  int,
  varchar,
  tinyint,
  text,
  index,
  unique,
} from 'drizzle-orm/mysql-core';

/**
 * Deck configuration table - stores deck-specific settings
 * Mirrors Anki 2.1's deck_config table
 */
export const echoeDeckConfig = mysqlTable(
  'echoe_deck_config',
  {
    id: int('id').primaryKey().notNull().autoincrement(), // Auto-increment internal primary key
    deckConfigId: varchar('deck_config_id', { length: 191 }).notNull().unique(), // Business ID (nanoid string)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    name: varchar('name', { length: 191 }).notNull(), // Config name
    replayq: tinyint('replayq').notNull().default(1), // Replay queue on answer
    timer: int('timer').notNull().default(0), // Show timer (0=off, 1=on)
    maxTaken: int('max_taken').notNull().default(60), // Max time taken (seconds)
    autoplay: tinyint('autoplay').notNull().default(1), // Auto-play audio (0=never, 1=front, 2=back, 3=both)
    ttsSpeed: tinyint('tts_speed').notNull().default(1), // TTS speed (0-4, maps to 0.5-2.0)
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    usn: int('usn').notNull(), // Update sequence number (sync)
    newConfig: text('new_config').notNull().$type<string>(), // JSON for new card settings
    revConfig: text('rev_config').notNull().$type<string>(), // JSON for review settings
    lapseConfig: text('lapse_config').notNull().$type<string>(), // JSON for lapse settings
  },
  (table) => ({
    nameIdx: index('name_idx').on(table.name),
    usnIdx: index('usn_idx').on(table.usn),
    uidDeckConfigIdIdx: index('uid_deck_config_id_idx').on(table.uid, table.deckConfigId),
    uidNameUnique: unique('uid_name_unique').on(table.uid, table.name),
  })
);

export type EchoeDeckConfig = typeof echoeDeckConfig.$inferSelect;
export type NewEchoeDeckConfig = typeof echoeDeckConfig.$inferInsert;
