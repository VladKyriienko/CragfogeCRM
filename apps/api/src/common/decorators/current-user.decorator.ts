import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '../request-context';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    if (!request.user) {
      throw new Error('CurrentUser used without AuthGuard');
    }
    return request.user;
  },
);
