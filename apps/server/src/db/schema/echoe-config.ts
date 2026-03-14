import {
  mysqlTable,
  varchar,
  text,
  primaryKey,
} from 'drizzle-orm/mysql-core';

/**
 * Config table - stores key-value configuration
 * Mirrors Anki 2.1's config table
 */
export const echoeConfig = mysqlTable(
  'echoe_config',
  {
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    key: varchar('key', { length: 191 }).notNull(), // Config key
    value: text('value').notNull().$type<string>(), // Config value (JSON)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.uid, table.key] }),
  })
);

export type EchoeConfig = typeof echoeConfig.$inferSelect;
export type NewEchoeConfig = typeof echoeConfig.$inferInsert;
