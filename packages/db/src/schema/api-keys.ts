import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { workspaceIsolationPolicy } from './policies';
import { users } from './users';
import { workspaces } from './workspaces';

/** Per-object scopes: object apiName → list of 'read' | 'write'. */
export type ApiKeyScopes = Record<string, Array<'read' | 'write'>>;

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: jsonb('scopes').$type<ApiKeyScopes>().notNull().default({}),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('api_keys_workspace_id_idx').on(table.workspaceId),
    index('api_keys_key_hash_idx').on(table.keyHash),
    workspaceIsolationPolicy('api_keys_workspace_isolation', table.workspaceId),
  ],
);
