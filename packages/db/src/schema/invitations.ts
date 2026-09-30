import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { workspaceIsolationPolicy } from './policies';
import { roles } from './roles';
import { users } from './users';
import { workspaces } from './workspaces';

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('invitations_workspace_id_idx').on(table.workspaceId),
    index('invitations_email_idx').on(table.email),
    workspaceIsolationPolicy('invitations_workspace_isolation', table.workspaceId),
  ],
);
