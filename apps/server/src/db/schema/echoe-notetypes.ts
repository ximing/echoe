import {
  mysqlTable,
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
    id: int('id').primaryKey().notNull().autoincrement(), // Auto-increment internal primary key
    noteTypeId: varchar('note_type_id', { length: 191 }).notNull().unique(), // Business ID (nanoid string)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    name: varchar('name', { length: 191 }).notNull(), // Note type name
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    usn: int('usn').notNull(), // Update sequence number (sync)
    sortf: int('sortf').notNull().default(0), // Field index used for sorting
    did: varchar('did', { length: 191 }).notNull().default(''), // Default deck ID - now business ID string
    tmpls: text('tmpls').notNull().$type<string>(), // JSON array of templates
    flds: text('flds').notNull().$type<string>(), // JSON array of field definitions
    css: text('css').notNull().$type<string>(), // Card CSS
    type: int('type').notNull().default(0), // Note type (0=standard, 1=cloze)
    latexPre: text('latex_pre').notNull().$type<string>(), // LaTeX preamble
    latexPost: text('latex_post').notNull().$type<string>(), // LaTeX postamble
    req: text('req').notNull().$type<string>(), // JSON array of which fields are required
  },
  (table) => ({
    noteTypeIdIdx: index('note_type_id_idx').on(table.noteTypeId),
    nameIdx: index('name_idx').on(table.name),
    usnIdx: index('usn_idx').on(table.usn),
    uidNoteTypeIdIdx: index('uid_note_type_id_idx').on(table.uid, table.noteTypeId),
    uidNameUnique: unique('uid_name_unique').on(table.uid, table.name),
  })
);

export type EchoeNotetypes = typeof echoeNotetypes.$inferSelect;
export type NewEchoeNotetypes = typeof echoeNotetypes.$inferInsert;
