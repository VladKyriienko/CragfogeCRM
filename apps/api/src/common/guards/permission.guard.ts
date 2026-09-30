import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  REQUIRE_PERMISSION_KEY,
  type RequirePermissionMeta,
} from '../decorators/require-permission.decorator';
import { canPerform, type RequestContext } from '../request-context';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<RequirePermissionMeta | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { workspaceContext?: RequestContext }>();
    const workspaceContext = request.workspaceContext;
    if (!workspaceContext) {
      throw new ForbiddenException('Workspace context required');
    }

    if (!canPerform(workspaceContext.permissions, meta.objectId, meta.action)) {
      throw new ForbiddenException('Missing permission');
    }
    return true;
  }
}
