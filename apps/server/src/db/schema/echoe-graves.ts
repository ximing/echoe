import {
  mysqlTable,
  bigint,
  int,
  varchar,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * Graves table - stores deleted items for sync
 * Mirrors Anki 2.1's graves table
 * Tracks deleted decks, notes, and cards for sync purposes
 */
export const echoeGraves = mysqlTable(
  'echoe_graves',
  {
    id: int('id').primaryKey().autoincrement(), // Row ID
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    usn: int('usn').notNull(), // Update sequence number (sync)
    oid: bigint('oid', { mode: 'number' }).notNull(), // Original object ID (deck/note/card ID)
    type: int('type').notNull(), // Object type: 0=deck, 1=note, 2=card
  },
  (table) => ({
    oidIdx: index('oid_idx').on(table.oid),
    typeIdx: index('type_idx').on(table.type),
    usnIdx: index('usn_idx').on(table.usn),
    uidOidTypeIdx: index('uid_oid_type_idx').on(table.uid, table.oid, table.type),
  })
);

export type EchoeGraves = typeof echoeGraves.$inferSelect;
export type NewEchoeGraves = typeof echoeGraves.$inferInsert;
