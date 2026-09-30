import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import {
  and,
  eq,
  memberships,
  objectDefinitions,
  roleFieldPermissions,
  roleObjectPermissions,
  roles,
  users,
  withWorkspace,
} from '@cragfoge/db';
import { ADMIN_OBJECT_ID, workspaceIdSchema, type FieldVisibility } from '@cragfoge/shared';
import type { Request } from 'express';
import { ApiKeyRateLimitService } from '../../api-keys/api-key-rate-limit.service';
import { scopesToPermissions } from '../../api-keys/api-key.util';
import type { ApiKeyAuth } from './auth.guard';
import type { RequestContext, RequestUser, ResolvedPermission } from '../request-context';

@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(@Inject(ApiKeyRateLimitService) private readonly apiKeyRateLimit: ApiKeyRateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & { user?: RequestUser; workspaceContext?: RequestContext; apiKeyAuth?: ApiKeyAuth }
    >();

    if (!request.user) {
      throw new ForbiddenException('Authentication required');
    }

    const header = request.header('x-workspace-id');
    if (!header) {
      throw new BadRequestException('X-Workspace-Id header is required');
    }

    const parsed = workspaceIdSchema.safeParse(header);
    if (!parsed.success) {
      throw new BadRequestException('X-Workspace-Id must be a UUID');
    }
    const workspaceId = parsed.data;
    const userId = request.user.id;

    if (request.apiKeyAuth) {
      if (request.apiKeyAuth.workspaceId !== workspaceId) {
        throw new ForbiddenException('API key workspace mismatch');
      }
      await this.apiKeyRateLimit.assertWithinLimit(request.apiKeyAuth.id);
      request.workspaceContext = await this.buildApiKeyContext(
        workspaceId,
        request.user,
        request.apiKeyAuth,
      );
      return true;
    }

    const contextData = await withWorkspace(workspaceId, async (tx) => {
      const [row] = await tx
        .select({
          membershipId: memberships.id,
          roleId: roles.id,
          roleKey: roles.key,
          roleName: roles.name,
          userId: users.id,
          email: users.email,
          name: users.name,
        })
        .from(memberships)
        .innerJoin(roles, eq(memberships.roleId, roles.id))
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId)))
        .limit(1);

      if (!row) {
        return null;
      }

      const permissionRows = await tx
        .select()
        .from(roleObjectPermissions)
        .where(
          and(
            eq(roleObjectPermissions.workspaceId, workspaceId),
            eq(roleObjectPermissions.roleId, row.roleId),
          ),
        );

      const permissions = new Map<string, ResolvedPermission>();
      for (const permission of permissionRows) {
        permissions.set(permission.objectId, {
          objectId: permission.objectId,
          canRead: permission.canRead,
          canCreate: permission.canCreate,
          canUpdate: permission.canUpdate,
          canDelete: permission.canDelete,
          scope: permission.scope === 'own' ? 'own' : 'all',
        });
      }

      if (row.roleKey === 'owner' || row.roleKey === 'admin') {
        permissions.set(ADMIN_OBJECT_ID, {
          objectId: ADMIN_OBJECT_ID,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
          scope: 'all',
        });
      }

      const fieldPermissionRows = await tx
        .select()
        .from(roleFieldPermissions)
        .where(
          and(
            eq(roleFieldPermissions.workspaceId, workspaceId),
            eq(roleFieldPermissions.roleId, row.roleId),
          ),
        );

      const fieldPermissions = new Map<string, FieldVisibility>();
      for (const permission of fieldPermissionRows) {
        const visibility = permission.visibility;
        if (visibility === 'hidden' || visibility === 'read' || visibility === 'write') {
          fieldPermissions.set(permission.fieldId, visibility);
        }
      }

      return {
        user: {
          id: row.userId,
          email: row.email,
          name: row.name,
        },
        workspaceId,
        membership: {
          id: row.membershipId,
          roleId: row.roleId,
          roleKey: row.roleKey,
          roleName: row.roleName,
        },
        permissions,
        fieldPermissions,
      } satisfies RequestContext;
    });

    if (!contextData) {
      throw new ForbiddenException('Not a member of this workspace');
    }

    request.workspaceContext = contextData;
    return true;
  }

  private async buildApiKeyContext(
    workspaceId: string,
    user: RequestUser,
    apiKey: ApiKeyAuth,
  ): Promise<RequestContext> {
    const objects = await withWorkspace(workspaceId, (tx) => tx.select().from(objectDefinitions));
    const objectsByApiName = new Map(objects.map((object) => [object.apiName, { id: object.id }]));
    const permissions = scopesToPermissions(apiKey.scopes, objectsByApiName);

    return {
      user,
      workspaceId,
      membership: {
        id: `api-key:${apiKey.id}`,
        roleId: `api-key:${apiKey.id}`,
        roleKey: 'api_key',
        roleName: 'API Key',
      },
      permissions,
      fieldPermissions: new Map(),
      apiKeyId: apiKey.id,
    };
  }
}
