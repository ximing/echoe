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
    id: int('id').primaryKey().autoincrement(), // Auto-increment internal primary key
    graveId: varchar('grave_id', { length: 191 }).notNull().unique(), // Business ID (nanoid string)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    usn: int('usn').notNull(), // Update sequence number (sync)
    oid: varchar('oid', { length: 191 }).notNull(), // Original object ID (deck/note/card ID) - now business ID string
    type: int('type').notNull(), // Object type: 0=deck, 1=note, 2=card
  },
  (table) => ({
    graveIdIdx: index('grave_id_idx').on(table.graveId),
    oidIdx: index('oid_idx').on(table.oid),
    typeIdx: index('type_idx').on(table.type),
    usnIdx: index('usn_idx').on(table.usn),
    uidGraveIdIdx: index('uid_grave_id_idx').on(table.uid, table.graveId),
    uidOidTypeIdx: index('uid_oid_type_idx').on(table.uid, table.oid, table.type),
  })
);

export type EchoeGraves = typeof echoeGraves.$inferSelect;
export type NewEchoeGraves = typeof echoeGraves.$inferInsert;
