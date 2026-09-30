import { SetMetadata } from '@nestjs/common';
import type { PermissionAction } from '@cragfoge/shared';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

export type RequirePermissionMeta = {
  objectId: string;
  action: PermissionAction;
};

export const RequirePermission = (objectId: string, action: PermissionAction) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { objectId, action } satisfies RequirePermissionMeta);
