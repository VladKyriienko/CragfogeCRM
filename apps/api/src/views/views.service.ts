import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, or, views, withWorkspace, type AppDatabase } from '@cragfoge/db';
import {
  ADMIN_OBJECT_ID,
  createViewBodySchema,
  updateViewBodySchema,
  viewSchema,
  type CreateViewBody,
  type UpdateViewBody,
  type ViewDto,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import { canPerform, type RequestContext } from '../common/request-context';
import { MetadataCacheService } from '../metadata/metadata-cache.service';
import { APP_DB } from '../tokens';

@Injectable()
export class ViewsService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MetadataCacheService) private readonly metadataCache: MetadataCacheService,
  ) {}

  async list(ctx: RequestContext, apiName: string): Promise<ViewDto[]> {
    const object = await this.resolveReadableObject(ctx, apiName);
    return withWorkspace(ctx.workspaceId, async (tx) => {
      const rows = await tx
        .select()
        .from(views)
        .where(
          and(
            eq(views.objectId, object.id),
            or(eq(views.isShared, true), eq(views.ownerId, ctx.user.id)),
          ),
        );
      return rows.map((row) => this.toDto(row));
    });
  }

  async create(ctx: RequestContext, apiName: string, body: CreateViewBody): Promise<ViewDto> {
    const input = createViewBodySchema.parse(body);
    const object = await this.resolveReadableObject(ctx, apiName);

    const created = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [row] = await tx
          .insert(views)
          .values({
            workspaceId: ctx.workspaceId,
            objectId: object.id,
            name: input.name,
            filters: input.filters ?? null,
            sort: input.sort ?? null,
            columns: input.columns,
            isShared: input.isShared,
            ownerId: ctx.user.id,
          })
          .returning();
        if (!row) {
          throw new NotFoundException('Could not create view');
        }
        return row;
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'view.create',
      entityType: 'view',
      entityId: created.id,
      diff: { name: created.name, isShared: created.isShared },
    });

    return this.toDto(created);
  }

  async update(
    ctx: RequestContext,
    apiName: string,
    viewId: string,
    body: UpdateViewBody,
  ): Promise<ViewDto> {
    const input = updateViewBodySchema.parse(body);
    const object = await this.resolveReadableObject(ctx, apiName);

    const updated = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const existing = await this.findView(tx, object.id, viewId);
        this.assertCanModify(ctx, existing, 'update');
        const [row] = await tx
          .update(views)
          .set({
            name: input.name ?? existing.name,
            filters: input.filters === undefined ? existing.filters : input.filters,
            sort: input.sort === undefined ? existing.sort : input.sort,
            columns: input.columns ?? existing.columns,
            isShared: input.isShared ?? existing.isShared,
            updatedAt: new Date(),
          })
          .where(eq(views.id, existing.id))
          .returning();
        if (!row) {
          throw new NotFoundException('View not found');
        }
        return row;
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'view.update',
      entityType: 'view',
      entityId: updated.id,
      diff: input,
    });

    return this.toDto(updated);
  }

  async remove(ctx: RequestContext, apiName: string, viewId: string): Promise<void> {
    const object = await this.resolveReadableObject(ctx, apiName);

    const deleted = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const existing = await this.findView(tx, object.id, viewId);
        this.assertCanModify(ctx, existing, 'delete');
        await tx.delete(views).where(eq(views.id, existing.id));
        return existing;
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'view.delete',
      entityType: 'view',
      entityId: deleted.id,
      diff: { name: deleted.name },
    });
  }

  private assertCanModify(
    ctx: RequestContext,
    view: typeof views.$inferSelect,
    action: 'update' | 'delete',
  ): void {
    if (view.ownerId === ctx.user.id) {
      return;
    }
    if (view.isShared && canPerform(ctx.permissions, ADMIN_OBJECT_ID, action)) {
      return;
    }
    throw new ForbiddenException('Cannot modify this view');
  }

  private async resolveReadableObject(ctx: RequestContext, apiName: string) {
    let resolved: Awaited<ReturnType<MetadataCacheService['getObject']>>;
    try {
      resolved = await this.metadataCache.getObject(ctx.workspaceId, apiName);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('OBJECT_NOT_FOUND:')) {
        throw new NotFoundException(`Object "${apiName}" not found`);
      }
      throw error;
    }
    if (!canPerform(ctx.permissions, resolved.object.id, 'read')) {
      throw new ForbiddenException('Missing permission');
    }
    return resolved.object;
  }

  private async findView(
    tx: Parameters<Parameters<typeof withWorkspace>[1]>[0],
    objectId: string,
    viewId: string,
  ) {
    const [row] = await tx
      .select()
      .from(views)
      .where(and(eq(views.id, viewId), eq(views.objectId, objectId)))
      .limit(1);
    if (!row) {
      throw new NotFoundException('View not found');
    }
    return row;
  }

  private toDto(row: typeof views.$inferSelect): ViewDto {
    return viewSchema.parse({
      id: row.id,
      objectId: row.objectId,
      name: row.name,
      filters: row.filters,
      sort: row.sort,
      columns: row.columns,
      isShared: row.isShared,
      ownerId: row.ownerId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
