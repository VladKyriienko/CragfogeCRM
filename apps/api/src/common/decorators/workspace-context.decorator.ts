import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestContext } from '../request-context';

export const WorkspaceContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { workspaceContext?: RequestContext }>();
    if (!request.workspaceContext) {
      throw new Error('WorkspaceContext used without WorkspaceGuard');
    }
    return request.workspaceContext;
  },
);
