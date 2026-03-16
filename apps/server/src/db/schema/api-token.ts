import {
  mysqlTable,
  varchar,
  timestamp,
  index,
} from 'drizzle-orm/mysql-core';

/**
 * API Token table - stores user API credentials
 * Tokens are hashed for security; users can create multiple tokens and revoke them
 */
export const apiToken = mysqlTable(
  'api_token',
  {
    tokenId: varchar('token_id', { length: 191 }).primaryKey().notNull(), // Unique token identifier (nanoid with 'at' prefix)
    uid: varchar('uid', { length: 191 }).notNull(), // User ID (owner of this token)
    name: varchar('name', { length: 255 }).notNull(), // Human-readable token name
    tokenHash: varchar('token_hash', { length: 255 }).notNull(), // Hashed token value for security
    deletedAt: timestamp('deleted_at', { mode: 'date', fsp: 3 }), // Soft delete timestamp (null = active)
    createdAt: timestamp('created_at', { mode: 'date', fsp: 3 }).notNull().defaultNow(), // Token creation time
    updatedAt: timestamp('updated_at', { mode: 'date', fsp: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()), // Last update time
  },
  (table) => ({
    uidIdx: index('uid_idx').on(table.uid), // Query tokens by user
    tokenHashIdx: index('token_hash_idx').on(table.tokenHash), // Validate token on auth
    deletedAtIdx: index('deleted_at_idx').on(table.deletedAt), // Filter for soft deletes
  })
);

export type ApiToken = typeof apiToken.$inferSelect;
export type NewApiToken = typeof apiToken.$inferInsert;
