import {
  mysqlTable,
  bigint,
  int,
  varchar,
  text,
  index,
  unique,
} from 'drizzle-orm/mysql-core';

/**
 * Note types table - stores card templates and field definitions
 * Mirrors Anki 2.1's notetypes table
 */
export const echoeNotetypes = mysqlTable(
  'echoe_notetypes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().notNull(), // Note type ID
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    name: varchar('name', { length: 191 }).notNull(), // Note type name
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    usn: int('usn').notNull(), // Update sequence number (sync)
    sortf: int('sortf').notNull().default(0), // Field index used for sorting
    did: bigint('did', { mode: 'number' }).notNull().default(0), // Default deck ID
    tmpls: text('tmpls').notNull().$type<string>(), // JSON array of templates
    flds: text('flds').notNull().$type<string>(), // JSON array of field definitions
    css: text('css').notNull().$type<string>(), // Card CSS
    type: int('type').notNull().default(0), // Note type (0=standard, 1=cloze)
    latexPre: text('latex_pre').notNull().$type<string>(), // LaTeX preamble
    latexPost: text('latex_post').notNull().$type<string>(), // LaTeX postamble
    req: text('req').notNull().$type<string>(), // JSON array of which fields are required
  },
  (table) => ({
    nameIdx: index('name_idx').on(table.name),
    usnIdx: index('usn_idx').on(table.usn),
    uidNameUnique: unique('uid_name_unique').on(table.uid, table.name),
  })
);

export type EchoeNotetypes = typeof echoeNotetypes.$inferSelect;
export type NewEchoeNotetypes = typeof echoeNotetypes.$inferInsert;
