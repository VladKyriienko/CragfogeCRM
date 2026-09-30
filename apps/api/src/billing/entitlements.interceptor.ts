import {
  type CallHandler,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { from, type Observable, switchMap } from 'rxjs';
import type { RequestContext } from '../common/request-context';
import { EntitlementsService } from './entitlements.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isAllowedWhenReadOnly(method: string, path: string): boolean {
  if (SAFE_METHODS.has(method)) {
    return true;
  }
  if (path.startsWith('/billing')) {
    return true;
  }
  if (method === 'POST' && /\/objects\/[^/]+\/exports\/?$/.test(path)) {
    return true;
  }
  return false;
}

@Injectable()
export class EntitlementsInterceptor implements NestInterceptor {
  constructor(@Inject(EntitlementsService) private readonly entitlements: EntitlementsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { workspaceContext?: RequestContext }>();
    const workspaceContext = request.workspaceContext;
    if (!workspaceContext) {
      return next.handle();
    }

    const method = (request.method ?? 'GET').toUpperCase();
    const path = request.path || request.url?.split('?')[0] || '';
    if (isAllowedWhenReadOnly(method, path)) {
      return next.handle();
    }

    return from(
      this.entitlements.isReadOnly(workspaceContext.workspaceId, workspaceContext.user.id),
    ).pipe(
      switchMap((readOnly) => {
        if (readOnly) {
          throw new ForbiddenException('Workspace is read-only. Export is still allowed.');
        }
        return next.handle();
      }),
    );
  }
}
