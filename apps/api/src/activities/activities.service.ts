import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  activities,
  and,
  eq,
  isNull,
  records,
  withWorkspace,
  type AppDatabase,
} from '@cragfoge/db';
import {
  activitySchema,
  createActivityBodySchema,
  updateActivityBodySchema,
  type ActivityDto,
  type CreateActivityBody,
  type UpdateActivityBody,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import { canPerform, type RequestContext } from '../common/request-context';
import { DomainEventsService } from '../events/domain-events.service';
import { MetadataCacheService } from '../metadata/metadata-cache.service';
import { APP_DB } from '../tokens';

@Injectable()
export class ActivitiesService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MetadataCacheService) private readonly metadataCache: MetadataCacheService,
    @Inject(DomainEventsService) private readonly domainEvents: DomainEventsService,
  ) {}

  async list(ctx: RequestContext, apiName: string, recordId: string): Promise<ActivityDto[]> {
    const { object } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'read');
    await this.findRecord(ctx, object.id, recordId);

    const rows = await withWorkspace(ctx.workspaceId, (tx) =>
      tx
        .select()
        .from(activities)
        .where(and(eq(activities.recordId, recordId), eq(activities.objectId, object.id))),
    );
    return rows.map((row) => this.toDto(row));
  }

  async create(
    ctx: RequestContext,
    apiName: string,
    recordId: string,
    body: CreateActivityBody,
    options?: { emitEvents?: boolean; source?: 'user' | 'automation' | 'system' },
  ): Promise<ActivityDto> {
    const input = createActivityBodySchema.parse(body);
    const { object } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'update');
    const record = await this.findRecord(ctx, object.id, recordId);

    const created = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [row] = await tx
          .insert(activities)
          .values({
            workspaceId: ctx.workspaceId,
            recordId,
            objectId: object.id,
            type: input.type ?? 'task',
            subject: input.subject,
            body: input.body ?? null,
            ownerId: input.ownerId ?? record.ownerId,
            dueAt: input.dueAt ? new Date(input.dueAt) : null,
            status: input.status ?? 'open',
            createdBy: ctx.user.id,
          })
          .returning();
        if (!row) {
          throw new NotFoundException('Could not create activity');
        }
        return row;
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'activity.create',
      entityType: 'activity',
      entityId: created.id,
      diff: { subject: created.subject, type: created.type, recordId },
    });

    if (options?.emitEvents !== false) {
      await this.domainEvents.emit({
        type: 'activity.created',
        workspaceId: ctx.workspaceId,
        objectId: object.id,
        objectApiName: apiName,
        recordId,
        actorUserId: ctx.user.id,
        record: {
          id: record.id,
          name: record.name,
          ownerId: record.ownerId,
          data: record.data,
        },
        activity: {
          id: created.id,
          type: created.type,
          subject: created.subject,
          ownerId: created.ownerId,
        },
        source: options?.source ?? 'user',
      });
    }

    return this.toDto(created);
  }

  async update(
    ctx: RequestContext,
    apiName: string,
    recordId: string,
    activityId: string,
    body: UpdateActivityBody,
  ): Promise<ActivityDto> {
    const input = updateActivityBodySchema.parse(body);
    const { object } = await this.resolveObject(ctx, apiName);
    this.assertObjectPermission(ctx, object.id, 'update');
    await this.findRecord(ctx, object.id, recordId);

    const updated = await withWorkspace(ctx.workspaceId, async (tx) => {
      const [row] = await tx
        .update(activities)
        .set({
          subject: input.subject,
          body: input.body === undefined ? undefined : input.body,
          ownerId: input.ownerId,
          dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
          status: input.status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(activities.id, activityId),
            eq(activities.recordId, recordId),
            eq(activities.objectId, object.id),
          ),
        )
        .returning();
      return row;
    });

    if (!updated) {
      throw new NotFoundException('Activity not found');
    }
    return this.toDto(updated);
  }

  /** Internal create used by automations (permissions already checked / system actor). */
  async createForAutomation(input: {
    workspaceId: string;
    objectId: string;
    objectApiName: string;
    recordId: string;
    actorUserId: string;
    subject: string;
    body?: string;
    ownerId: string;
    dueAt?: string;
    record: { id: string; name: string; ownerId: string; data: Record<string, unknown> };
  }): Promise<ActivityDto> {
    const created = await withWorkspace(
      input.workspaceId,
      async (tx) => {
        const [row] = await tx
          .insert(activities)
          .values({
            workspaceId: input.workspaceId,
            recordId: input.recordId,
            objectId: input.objectId,
            type: 'task',
            subject: input.subject,
            body: input.body ?? null,
            ownerId: input.ownerId,
            dueAt: input.dueAt ? new Date(input.dueAt) : null,
            status: 'open',
            createdBy: input.actorUserId,
          })
          .returning();
        if (!row) {
          throw new NotFoundException('Could not create activity');
        }
        return row;
      },
      { userId: input.actorUserId },
    );

    await this.domainEvents.emit({
      type: 'activity.created',
      workspaceId: input.workspaceId,
      objectId: input.objectId,
      objectApiName: input.objectApiName,
      recordId: input.recordId,
      actorUserId: input.actorUserId,
      record: input.record,
      activity: {
        id: created.id,
        type: created.type,
        subject: created.subject,
        ownerId: created.ownerId,
      },
      source: 'automation',
    });

    return this.toDto(created);
  }

  private async resolveObject(ctx: RequestContext, apiName: string) {
    try {
      return await this.metadataCache.getObject(ctx.workspaceId, apiName);
    } catch {
      throw new NotFoundException('Object not found');
    }
  }

  private async findRecord(ctx: RequestContext, objectId: string, recordId: string) {
    const [row] = await withWorkspace(ctx.workspaceId, (tx) =>
      tx
        .select()
        .from(records)
        .where(
          and(eq(records.id, recordId), eq(records.objectId, objectId), isNull(records.deletedAt)),
        )
        .limit(1),
    );
    if (!row) {
      throw new NotFoundException('Record not found');
    }
    return row;
  }

  private assertObjectPermission(
    ctx: RequestContext,
    objectId: string,
    action: 'read' | 'update',
  ): void {
    if (!canPerform(ctx.permissions, objectId, action)) {
      throw new ForbiddenException('Missing permission');
    }
  }

  private toDto(row: typeof activities.$inferSelect): ActivityDto {
    return activitySchema.parse({
      id: row.id,
      recordId: row.recordId,
      objectId: row.objectId,
      type: row.type,
      subject: row.subject,
      body: row.body,
      ownerId: row.ownerId,
      dueAt: row.dueAt,
      status: row.status,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
