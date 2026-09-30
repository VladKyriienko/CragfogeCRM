import type { FieldVisibility, PermissionAction } from '@cragfoge/shared';

export type ResolvedPermission = {
  objectId: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  scope: 'all' | 'own';
};

export type RequestUser = {
  id: string;
  email: string;
  name: string;
};

export type RequestMembership = {
  id: string;
  roleId: string;
  roleKey: string;
  roleName: string;
};

export type RequestContext = {
  user: RequestUser;
  workspaceId: string;
  membership: RequestMembership;
  permissions: Map<string, ResolvedPermission>;
  /** fieldId → visibility. Missing entry means default write. */
  fieldPermissions: Map<string, FieldVisibility>;
  /** Set when the request was authenticated with an API key. */
  apiKeyId?: string;
};

export function canPerform(
  permissions: Map<string, ResolvedPermission>,
  objectId: string,
  action: PermissionAction,
): boolean {
  const permission = permissions.get(objectId);
  if (!permission) {
    return false;
  }
  switch (action) {
    case 'read':
      return permission.canRead;
    case 'create':
      return permission.canCreate;
    case 'update':
      return permission.canUpdate;
    case 'delete':
      return permission.canDelete;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function fieldVisibility(
  fieldPermissions: Map<string, FieldVisibility>,
  fieldId: string,
): FieldVisibility {
  return fieldPermissions.get(fieldId) ?? 'write';
}
