import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import {
  and,
  apiKeys,
  eq,
  isNull,
  users,
  withWorkspace,
} from '@cragfoge/db';
import { workspaceIdSchema, type ApiKeyScopes } from '@cragfoge/shared';
import type { Request } from 'express';
import { hashApiKey, parseBearerToken } from '../../api-keys/api-key.util';
import { AUTH } from '../../auth/auth.tokens';
import type { AuthInstance } from '../../auth/auth';
import type { RequestUser } from '../request-context';

export type ApiKeyAuth = {
  id: string;
  scopes: ApiKeyScopes;
  workspaceId: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: AuthInstance) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & { user?: RequestUser; apiKeyAuth?: ApiKeyAuth }
    >();

    const bearer = parseBearerToken(request.headers.authorization);
    if (bearer) {
      await this.authenticateApiKey(request, bearer);
      return true;
    }

    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session?.user) {
      throw new UnauthorizedException('Authentication required');
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
    return true;
  }

  private async authenticateApiKey(
    request: Request & { user?: RequestUser; apiKeyAuth?: ApiKeyAuth },
    rawKey: string,
  ): Promise<void> {
    const header = request.header('x-workspace-id');
    if (!header) {
      throw new BadRequestException('X-Workspace-Id header is required');
    }
    const parsed = workspaceIdSchema.safeParse(header);
    if (!parsed.success) {
      throw new BadRequestException('X-Workspace-Id must be a UUID');
    }
    const workspaceId = parsed.data;
    const keyHash = hashApiKey(rawKey);

    const resolved = await withWorkspace(workspaceId, async (tx) => {
      const [key] = await tx
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
        .limit(1);
      if (!key) {
        return null;
      }

      const [user] = await tx.select().from(users).where(eq(users.id, key.createdBy)).limit(1);
      if (!user) {
        return null;
      }

      await tx
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, key.id));

      return { key, user };
    });

    if (!resolved) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.user = {
      id: resolved.user.id,
      email: resolved.user.email,
      name: resolved.user.name,
    };
    request.apiKeyAuth = {
      id: resolved.key.id,
      scopes: resolved.key.scopes,
      workspaceId,
    };
  }
}
