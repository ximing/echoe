import {
  mysqlTable,
  bigint,
  int,
  varchar,
  text,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Cards table - stores flashcard instances
 * Mirrors Anki 2.1's cards table
 */
export const echoeCards = mysqlTable(
  'echoe_cards',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().notNull(), // Unique ID (Unix timestamp in ms * 1000 + random)
    nid: bigint('nid', { mode: 'number' }).notNull(), // Note ID
    did: bigint('did', { mode: 'number' }).notNull(), // Deck ID
    ord: int('ord').notNull(), // Template ordinal (which template generates this card)
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    usn: int('usn').notNull(), // Update sequence number (sync)
    type: int('type').notNull().default(0), // Card type: 0=new, 1=learning, 2=review, 3=relearning
    queue: int('queue').notNull().default(0), // Queue type: 0=new, 1=learning, 2=review, -1=suspended, -2=buried (manual), -3=buried (sibling)
    due: bigint('due', { mode: 'number' }).notNull().default(0), // Due date (Unix timestamp in ms for learning, day number for review)
    ivl: int('ivl').notNull().default(0), // Interval (days)
    factor: int('factor').notNull().default(0), // Ease factor (permille, e.g., 2500 = 2.5)
    reps: int('reps').notNull().default(0), // Number of times reviewed
    lapses: int('lapses').notNull().default(0), // Number of times lapsed
    left: int('left').notNull().default(0), // Steps remaining in learning (bits)
    odue: bigint('odue', { mode: 'number' }).notNull().default(0), // Original due (for filtered decks)
    odid: bigint('odid', { mode: 'number' }).notNull().default(0), // Original deck ID (for filtered decks)
    flags: int('flags').notNull().default(0), // Flags
    data: text('data').notNull().$type<string>(), // Extra data field (JSON)
  },
  (table) => ({
    nidIdx: index('nid_idx').on(table.nid),
    didIdx: index('did_idx').on(table.did),
    usnIdx: index('usn_idx').on(table.usn),
    queueIdx: index('queue_idx').on(table.queue),
    dueIdx: index('due_idx').on(table.due),
  })
);

export type EchoeCards = typeof echoeCards.$inferSelect;
export type NewEchoeCards = typeof echoeCards.$inferInsert;
