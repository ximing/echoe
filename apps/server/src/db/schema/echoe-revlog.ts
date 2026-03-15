import {
  mysqlTable,
  bigint,
  int,
  index,
  double,
  text,
  varchar,
} from 'drizzle-orm/mysql-core';
import { echoeCards } from './echoe-cards.js';

/**
 * Review log table - stores review history
 * Mirrors Anki 2.1's revlog table
 * Extended with FSRS fields and pre-review snapshot for undo functionality
 */
export const echoeRevlog = mysqlTable(
  'echoe_revlog',
  {
    id: int('id').primaryKey().notNull().autoincrement(), // Auto-increment internal primary key
    revlogId: varchar('revlog_id', { length: 191 }).notNull().unique(), // Business ID (nanoid string)
    cid: varchar('cid', { length: 191 })
      .notNull()
      .references(() => echoeCards.cardId, { onDelete: 'cascade' }), // Card ID - now business ID string
    uid: varchar('uid', { length: 191 }).notNull(), // User ID (owner of this review record)
    usn: int('usn').notNull(), // Update sequence number (sync)
    ease: int('ease').notNull(), // Ease factor chosen: 1 Again, 2 Hard, 3 Good, 4 Easy
    ivl: int('ivl').notNull(), // Interval (days) after this review
    lastIvl: int('last_ivl').notNull(), // Previous interval before this review
    factor: int('factor').notNull(), // Ease factor after this review (permille)
    time: int('time').notNull(), // Time taken for this review (ms)
    type: int('type').notNull(), // Review type: 0=learning, 1=review, 2=relearning, 3=filtered, 4=custom study
    // FSRS fields (current state after review)
    stability: double('stability').notNull().default(0), // Stability after this review
    difficulty: double('difficulty').notNull().default(0), // Difficulty after this review
    lastReview: bigint('last_review', { mode: 'number' }).notNull().default(0), // Last review timestamp (Unix ms)
    // Pre-review snapshot (for undo functionality)
    preDue: bigint('pre_due', { mode: 'number' }).notNull().default(0), // Due timestamp before review
    preIvl: int('pre_ivl').notNull().default(0), // Interval before review
    preFactor: int('pre_factor').notNull().default(0), // Ease factor before review
    preReps: int('pre_reps').notNull().default(0), // Reps count before review
    preLapses: int('pre_lapses').notNull().default(0), // Lapses count before review
    preLeft: int('pre_left').notNull().default(0), // Steps left before review
    preType: int('pre_type').notNull().default(0), // Card type before review
    preQueue: int('pre_queue').notNull().default(0), // Queue before review
    preStability: double('pre_stability').notNull().default(0), // Stability before review
    preDifficulty: double('pre_difficulty').notNull().default(0), // Difficulty before review
    preLastReview: bigint('pre_last_review', { mode: 'number' }).notNull().default(0), // Last review before review
  },
  (table) => ({
    revlogIdIdx: index('revlog_id_idx').on(table.revlogId),
    cidIdx: index('cid_idx').on(table.cid),
    usnIdx: index('usn_idx').on(table.usn),
    uidIdx: index('uid_idx').on(table.uid),
    uidRevlogIdIdx: index('uid_revlog_id_idx').on(table.uid, table.revlogId),
    uidCidIdx: index('uid_cid_idx').on(table.uid, table.cid),
  })
);

export type EchoeRevlog = typeof echoeRevlog.$inferSelect;
export type NewEchoeRevlog = typeof echoeRevlog.$inferInsert;
