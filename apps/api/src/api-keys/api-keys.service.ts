import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, apiKeys, eq, isNull, withWorkspace, type AppDatabase } from '@cragfoge/db';
import {
  apiKeySchema,
  createApiKeyBodySchema,
  createdApiKeySchema,
  type ApiKeyDto,
  type CreateApiKeyBody,
  type CreatedApiKeyDto,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/request-context';
import { APP_DB } from '../tokens';
import { generateApiKey } from './api-key.util';

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(ctx: RequestContext): Promise<ApiKeyDto[]> {
    const rows = await withWorkspace(ctx.workspaceId, (tx) =>
      tx.select().from(apiKeys).where(isNull(apiKeys.revokedAt)),
    );
    return rows.map((row) => this.toDto(row));
  }

  async create(ctx: RequestContext, body: CreateApiKeyBody): Promise<CreatedApiKeyDto> {
    const input = createApiKeyBodySchema.parse(body);
    const generated = generateApiKey();

    const created = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [row] = await tx
          .insert(apiKeys)
          .values({
            workspaceId: ctx.workspaceId,
            name: input.name,
            keyPrefix: generated.keyPrefix,
            keyHash: generated.keyHash,
            scopes: input.scopes,
            createdBy: ctx.user.id,
          })
          .returning();
        if (!row) {
          throw new NotFoundException('Could not create API key');
        }
        return row;
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'api_key.create',
      entityType: 'api_key',
      entityId: created.id,
      diff: { name: created.name, scopes: created.scopes, keyPrefix: created.keyPrefix },
    });

    return createdApiKeySchema.parse({
      ...this.toDto(created),
      rawKey: generated.rawKey,
    });
  }

  async revoke(ctx: RequestContext, id: string): Promise<void> {
    const revoked = await withWorkspace(ctx.workspaceId, async (tx) => {
      const [row] = await tx
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
        .returning();
      return row;
    });

    if (!revoked) {
      throw new NotFoundException('API key not found');
    }

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'api_key.revoke',
      entityType: 'api_key',
      entityId: id,
      diff: { name: revoked.name },
    });
  }

  private toDto(row: typeof apiKeys.$inferSelect): ApiKeyDto {
    return apiKeySchema.parse({
      id: row.id,
      name: row.name,
      keyPrefix: row.keyPrefix,
      scopes: row.scopes,
      lastUsedAt: row.lastUsedAt,
      revokedAt: row.revokedAt,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    });
  }
}
