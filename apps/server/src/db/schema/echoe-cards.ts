import {
  mysqlTable,
  bigint,
  int,
  varchar,
  text,
  index,
  double,
} from 'drizzle-orm/mysql-core';

/**
 * Cards table - stores flashcard instances
 * Mirrors Anki 2.1's cards table
 * Extended with FSRS fields: stability, difficulty, last_review
 */
export const echoeCards = mysqlTable(
  'echoe_cards',
  {
    id: int('id').primaryKey().notNull().autoincrement(), // Auto-increment internal primary key
    cardId: varchar('card_id', { length: 191 }).notNull().unique(), // Business ID (nanoid string)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    nid: varchar('nid', { length: 191 }).notNull(), // Note ID - now business ID string
    did: varchar('did', { length: 191 }).notNull(), // Deck ID - now business ID string
    ord: int('ord').notNull(), // Template ordinal (which template generates this card)
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    usn: int('usn').notNull(), // Update sequence number (sync)
    type: int('type').notNull().default(0), // Card type: 0=new, 1=learning, 2=review, 3=relearning
    queue: int('queue').notNull().default(0), // Queue type: 0=new, 1=learning, 2=review, -1=suspended, -2=buried (manual), -3=buried (sibling)
    due: bigint('due', { mode: 'number' }).notNull().default(0), // Due time (Unix timestamp in milliseconds)
    ivl: int('ivl').notNull().default(0), // Interval (days)
    factor: int('factor').notNull().default(0), // Ease factor (permille, e.g., 2500 = 2.5)
    reps: int('reps').notNull().default(0), // Number of times reviewed
    lapses: int('lapses').notNull().default(0), // Number of times lapsed
    left: int('left').notNull().default(0), // Steps remaining in learning (bits)
    odue: bigint('odue', { mode: 'number' }).notNull().default(0), // Original due (for filtered decks)
    odid: varchar('odid', { length: 191 }).notNull().default(''), // Original deck ID (for filtered decks) - now business ID string
    flags: int('flags').notNull().default(0), // Flags
    data: text('data').notNull().$type<string>(), // Extra data field (JSON)
    // FSRS fields
    stability: double('stability').notNull().default(0), // Stability (days) - represents how well the card is remembered
    difficulty: double('difficulty').notNull().default(0), // FSRS difficulty (ts-fsrs raw scale, not a probability)
    lastReview: bigint('last_review', { mode: 'number' }).notNull().default(0), // Last review timestamp (Unix ms)
  },
  (table) => ({
    cardIdIdx: index('card_id_idx').on(table.cardId),
    nidIdx: index('nid_idx').on(table.nid),
    didIdx: index('did_idx').on(table.did),
    usnIdx: index('usn_idx').on(table.usn),
    queueIdx: index('queue_idx').on(table.queue),
    dueIdx: index('due_idx').on(table.due),
    // FSRS-related indexes
    didQueueDueIdx: index('did_queue_due_idx').on(table.did, table.queue, table.due),
    didLastReviewIdx: index('did_last_review_idx').on(table.did, table.lastReview),
    didStabilityIdx: index('did_stability_idx').on(table.did, table.stability),
    // Multi-user isolation indexes
    uidCardIdIdx: index('uid_card_id_idx').on(table.uid, table.cardId),
    uidNidIdx: index('uid_nid_idx').on(table.uid, table.nid),
    uidDidQueueDueIdx: index('uid_did_queue_due_idx').on(table.uid, table.did, table.queue, table.due),
    uidLastReviewIdx: index('uid_last_review_idx').on(table.uid, table.lastReview),
  })
);

export type EchoeCards = typeof echoeCards.$inferSelect;
export type NewEchoeCards = typeof echoeCards.$inferInsert;
