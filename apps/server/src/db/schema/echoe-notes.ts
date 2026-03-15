import {
  mysqlTable,
  int,
  varchar,
  text,
  json,
  index,
  unique,
} from 'drizzle-orm/mysql-core';
import type { CanonicalFields, RichTextFields } from '../../types/note-fields.js';
import { echoeNotetypes } from './echoe-notetypes.js';

/**
 * Notes table - stores flashcard content (notes)
 * Mirrors Anki 2.1's notes table
 */
export const echoeNotes = mysqlTable(
  'echoe_notes',
  {
    id: int('id').primaryKey().notNull().autoincrement(), // Auto-increment internal primary key
    noteId: varchar('note_id', { length: 191 }).notNull().unique(), // Business ID (nanoid string)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID for tenant isolation
    guid: varchar('guid', { length: 191 }).notNull(), // Globally unique ID for sync (40 char hex string)
    mid: varchar('mid', { length: 191 })
      .notNull()
      .references(() => echoeNotetypes.noteTypeId, { onDelete: 'cascade' }), // Model ID (note type ID) - now business ID string
    mod: int('mod').notNull(), // Last modified time (Unix timestamp in seconds)
    usn: int('usn').notNull(), // Update sequence number (sync)
    tags: text('tags').notNull().$type<string>(), // JSON array of tags
    flds: text('flds').notNull(), // Field values (joined by \x1f)
    sfld: varchar('sfld', { length: 191 }).notNull(), // Sort field (first field, cleaned)
    csum: varchar('csum', { length: 191 }).notNull(), // Checksum of sort field (for duplicates)
    flags: int('flags').notNull().default(0), // Flags (1 = marked)
    data: text('data').notNull().$type<string>(), // Extra data field (JSON)
    richTextFields: json('rich_text_fields').$type<RichTextFields>(), // Rich text JSON for fields (keyed by field name → ProseMirror doc)
    fldNames: json('fld_names').$type<string[]>(), // JSON array of field names for mapping fields to values
    fieldsJson: json('fields_json').$type<CanonicalFields>().notNull().default({}), // Primary structured field storage (field name → plain text value)
  },
  (table) => ({
    guidIdx: index('guid_idx').on(table.guid),
    midIdx: index('mid_idx').on(table.mid),
    usnIdx: index('usn_idx').on(table.usn),
    sfldIdx: index('sfld_idx').on(table.sfld),
    uidGuidUnique: unique('uid_guid_unique').on(table.uid, table.guid),
    uidNoteIdIdx: index('uid_note_id_idx').on(table.uid, table.noteId),
    uidMidIdx: index('uid_mid_idx').on(table.uid, table.mid),
    uidSfldIdx: index('uid_sfld_idx').on(table.uid, table.sfld),
    uidModIdx: index('uid_mod_idx').on(table.uid, table.mod),
  })
);

export type EchoeNotes = typeof echoeNotes.$inferSelect;
export type NewEchoeNotes = typeof echoeNotes.$inferInsert;
