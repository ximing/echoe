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
    key: varchar('key', { length: 191 }).primaryKey(), // Config key
    value: text('value').notNull().$type<string>(), // Config value (JSON)
  }
);

export type EchoeConfig = typeof echoeConfig.$inferSelect;
export type NewEchoeConfig = typeof echoeConfig.$inferInsert;
