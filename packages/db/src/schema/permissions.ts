import { boolean, foreignKey, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { fieldDefinitions, objectDefinitions } from './objects';
import { workspaceIsolationPolicy } from './policies';
import { roles } from './roles';
import { workspaces } from './workspaces';

export const permissionScopeValues = ['all', 'own'] as const;
export type PermissionScope = (typeof permissionScopeValues)[number];

export const fieldVisibilityValues = ['hidden', 'read', 'write'] as const;
export type FieldVisibility = (typeof fieldVisibilityValues)[number];

export const roleObjectPermissions = pgTable(
  'role_object_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    objectId: uuid('object_id').notNull(),
    canRead: boolean('can_read').notNull().default(false),
    canCreate: boolean('can_create').notNull().default(false),
    canUpdate: boolean('can_update').notNull().default(false),
    canDelete: boolean('can_delete').notNull().default(false),
    scope: text('scope').notNull().default('all').$type<PermissionScope>(),
  },
  (table) => [
    foreignKey({
      name: 'role_object_permissions_object_fk',
      columns: [table.objectId, table.workspaceId],
      foreignColumns: [objectDefinitions.id, objectDefinitions.workspaceId],
    }).onDelete('cascade'),
    unique('role_object_permissions_role_object_unique').on(table.roleId, table.objectId),
    index('role_object_permissions_workspace_id_idx').on(table.workspaceId),
    workspaceIsolationPolicy('role_object_permissions_workspace_isolation', table.workspaceId),
  ],
);

export const roleFieldPermissions = pgTable(
  'role_field_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    fieldId: uuid('field_id').notNull(),
    visibility: text('visibility').notNull().default('hidden').$type<FieldVisibility>(),
  },
  (table) => [
    foreignKey({
      name: 'role_field_permissions_field_fk',
      columns: [table.fieldId, table.workspaceId],
      foreignColumns: [fieldDefinitions.id, fieldDefinitions.workspaceId],
    }).onDelete('cascade'),
    unique('role_field_permissions_role_field_unique').on(table.roleId, table.fieldId),
    index('role_field_permissions_workspace_id_idx').on(table.workspaceId),
    workspaceIsolationPolicy('role_field_permissions_workspace_isolation', table.workspaceId),
  ],
);
