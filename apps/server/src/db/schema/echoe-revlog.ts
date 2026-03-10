import {
  mysqlTable,
  bigint,
  int,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Review log table - stores review history
 * Mirrors Anki 2.1's revlog table
 */
export const echoeRevlog = mysqlTable(
  'echoe_revlog',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().notNull(), // Unique ID (Unix timestamp in ms * 1000 + random)
    cid: bigint('cid', { mode: 'number' }).notNull(), // Card ID
    usn: int('usn').notNull(), // Update sequence number (sync)
    ease: int('ease').notNull(), // Ease factor chosen: 1 Again, 2 Hard, 3 Good, 4 Easy
    ivl: int('ivl').notNull(), // Interval (days) after this review
    lastIvl: int('last_ivl').notNull(), // Previous interval before this review
    factor: int('factor').notNull(), // Ease factor after this review (permille)
    time: int('time').notNull(), // Time taken for this review (ms)
    type: int('type').notNull(), // Review type: 0=learning, 1=review, 2=relearning, 3=filtered, 4=custom study
  },
  (table) => ({
    cidIdx: index('cid_idx').on(table.cid),
    usnIdx: index('usn_idx').on(table.usn),
  })
);

export type EchoeRevlog = typeof echoeRevlog.$inferSelect;
export type NewEchoeRevlog = typeof echoeRevlog.$inferInsert;
