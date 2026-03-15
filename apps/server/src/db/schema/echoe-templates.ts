import {
  mysqlTable,
  int,
  varchar,
  text,
  index,
  unique,
} from 'drizzle-orm/mysql-core';
import { echoeNotetypes } from './echoe-notetypes.js';
import { echoeDecks } from './echoe-decks.js';

/**
 * Templates table - stores card templates for note types
 * Mirrors Anki 2.1's templates table
 * Note: In Anki 2.1, templates are stored as JSON within notetypes.tmpls
 * This table provides a normalized alternative for easier querying
 */
export const echoeTemplates = mysqlTable(
  'echoe_templates',
  {
    id: int('id').primaryKey().notNull().autoincrement(), // Auto-increment internal primary key
    templateId: varchar('template_id', { length: 191 }).notNull().unique(), // Business ID (nanoid string)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    ntid: varchar('ntid', { length: 191 }).notNull(), // Note type ID - business ID string
    name: varchar('name', { length: 191 }).notNull(), // Template name
    ord: int('ord').notNull(), // Template ordinal (0-based)
    qfmt: text('qfmt').notNull().$type<string>(), // Question format (front side)
    afmt: text('afmt').notNull().$type<string>(), // Answer format (back side)
    bqfmt: text('bqfmt').notNull().$type<string>(), // Browser question format
    bafmt: text('bafmt').notNull().$type<string>(), // Browser answer format
    did: varchar('did', { length: 191 }), // Override deck ID - business ID string (nullable)
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    usn: int('usn').notNull(), // Update sequence number (sync)
  },
  (table) => ({
    ntidIdx: index('ntid_idx').on(table.ntid),
    ordIdx: index('ord_idx').on(table.ord),
    usnIdx: index('usn_idx').on(table.usn),
    uidTemplateIdIdx: index('uid_template_id_idx').on(table.uid, table.templateId),
    uidNtidOrdUnique: unique('uid_ntid_ord_unique').on(table.uid, table.ntid, table.ord),
  })
);

export type EchoeTemplates = typeof echoeTemplates.$inferSelect;
export type NewEchoeTemplates = typeof echoeTemplates.$inferInsert;
