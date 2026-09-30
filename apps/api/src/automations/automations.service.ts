import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  automationRuns,
  automations,
  desc,
  eq,
  fieldDefinitions,
  isNull,
  objectDefinitions,
  records,
  sql,
  withWorkspace,
} from '@cragfoge/db';
import {
  automationRunSchema,
  automationSchema,
  createAutomationBodySchema,
  filterGroupSchema,
  updateAutomationBodySchema,
  type AutomationAction,
  type AutomationDto,
  type AutomationRunDto,
  type AutomationTrigger,
  type CreateAutomationBody,
  type FilterGroup,
  type UpdateAutomationBody,
} from '@cragfoge/shared';
import { ActivitiesService } from '../activities/activities.service';
import { AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/request-context';
import type { Env } from '../config/env';
import { EMAIL_PROVIDER, type EmailProvider } from '../email/email.types';
import type { DomainEvent } from '../events/domain-events';
import { compileFilter } from '../records/filter-sql';
import { ENV } from '../tokens';
import { WebhooksService } from '../webhooks/webhooks.service';
import { AutomationLoopService } from './automation-loop.service';
import { renderTemplate } from './template';

@Injectable()
export class AutomationsService {
  constructor(
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ActivitiesService) private readonly activities: ActivitiesService,
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
    @Inject(AutomationLoopService) private readonly loopGuard: AutomationLoopService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(ctx: RequestContext): Promise<AutomationDto[]> {
    const rows = await withWorkspace(ctx.workspaceId, (tx) => tx.select().from(automations));
    return rows.map((row) => this.toDto(row));
  }

  async create(ctx: RequestContext, body: CreateAutomationBody): Promise<AutomationDto> {
    const input = createAutomationBodySchema.parse(body);
    this.assertActionsValid(input.actions);

    const created = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [object] = await tx
          .select({ id: objectDefinitions.id })
          .from(objectDefinitions)
          .where(eq(objectDefinitions.id, input.objectId))
          .limit(1);
        if (!object) {
          throw new NotFoundException('Object not found');
        }
        const [row] = await tx
          .insert(automations)
          .values({
            workspaceId: ctx.workspaceId,
            objectId: input.objectId,
            name: input.name,
            trigger: input.trigger,
            conditions: input.conditions ?? null,
            actions: input.actions,
            isActive: input.isActive ?? true,
            createdBy: ctx.user.id,
          })
          .returning();
        if (!row) {
          throw new NotFoundException('Could not create automation');
        }
        return row;
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'automation.create',
      entityType: 'automation',
      entityId: created.id,
      diff: { name: created.name, trigger: created.trigger },
    });

    if ((created.trigger as AutomationTrigger).type === 'date_reached') {
      this.registerWorkspaceForDateScan(ctx.workspaceId);
    }

    return this.toDto(created);
  }

  async update(
    ctx: RequestContext,
    id: string,
    body: UpdateAutomationBody,
  ): Promise<AutomationDto> {
    const input = updateAutomationBodySchema.parse(body);
    if (input.actions) {
      this.assertActionsValid(input.actions);
    }

    const updated = await withWorkspace(ctx.workspaceId, async (tx) => {
      const [row] = await tx
        .update(automations)
        .set({
          name: input.name,
          trigger: input.trigger,
          conditions: input.conditions === undefined ? undefined : input.conditions,
          actions: input.actions,
          isActive: input.isActive,
          updatedAt: new Date(),
        })
        .where(eq(automations.id, id))
        .returning();
      return row;
    });
    if (!updated) {
      throw new NotFoundException('Automation not found');
    }
    return this.toDto(updated);
  }

  async remove(ctx: RequestContext, id: string): Promise<void> {
    const deleted = await withWorkspace(ctx.workspaceId, async (tx) => {
      const [row] = await tx.delete(automations).where(eq(automations.id, id)).returning();
      return row;
    });
    if (!deleted) {
      throw new NotFoundException('Automation not found');
    }
  }

  async listRuns(ctx: RequestContext, automationId: string): Promise<AutomationRunDto[]> {
    const rows = await withWorkspace(ctx.workspaceId, async (tx) => {
      const [auto] = await tx
        .select({ id: automations.id })
        .from(automations)
        .where(eq(automations.id, automationId))
        .limit(1);
      if (!auto) {
        return null;
      }
      return tx
        .select()
        .from(automationRuns)
        .where(eq(automationRuns.automationId, automationId))
        .orderBy(desc(automationRuns.createdAt))
        .limit(50);
    });
    if (!rows) {
      throw new NotFoundException('Automation not found');
    }
    return rows.map((row) => this.toRunDto(row));
  }

  async handleDomainEvent(event: DomainEvent): Promise<void> {
    if (
      event.type !== 'record.created' &&
      event.type !== 'record.updated' &&
      event.type !== 'record.stage_changed' &&
      event.type !== 'record.deleted'
    ) {
      return;
    }
    if (event.type === 'record.deleted' || !event.record) {
      return;
    }

    const active = await withWorkspace(event.workspaceId, (tx) =>
      tx
        .select()
        .from(automations)
        .where(
          and(eq(automations.objectId, event.objectId), eq(automations.isActive, true)),
        ),
    );

    for (const automation of active) {
      const trigger = automation.trigger as AutomationTrigger;
      if (!this.triggerMatches(trigger, event)) {
        continue;
      }
      await this.runAutomation(automation, event);
    }
  }

  async scanDateReached(): Promise<void> {
    const allAutos = await this.loadAllDateReachedAutomations();
    const today = new Date().toISOString().slice(0, 10);

    for (const auto of allAutos) {
      const trigger = auto.trigger as AutomationTrigger;
      if (trigger.type !== 'date_reached') {
        continue;
      }
      const field = trigger.field;
      const candidates = await withWorkspace(auto.workspaceId, async (tx) => {
        const fieldRows = await tx
          .select()
          .from(fieldDefinitions)
          .where(
            and(eq(fieldDefinitions.objectId, auto.objectId), isNull(fieldDefinitions.deletedAt)),
          );
        const fields = fieldRows.map((row) => ({
          id: row.id,
          objectId: row.objectId,
          apiName: row.apiName,
          label: row.label,
          type: row.type,
          required: row.required,
          isUnique: row.isUnique,
          isSystem: row.isSystem,
          options: (row.options ?? {}) as Record<string, unknown>,
          position: row.position,
          isIndexed: row.isIndexed,
          deletedAt: row.deletedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
        const filter: FilterGroup = {
          and: [{ field, op: 'eq', value: today }],
        };
        const compiled = compileFilter(filter, fields as never);
        const conditions = [sql`object_id = ${auto.objectId}`, sql`deleted_at is null`];
        if (compiled.sql) {
          conditions.push(compiled.sql);
        }
        return tx
          .select()
          .from(records)
          .where(sql.join(conditions, sql` and `))
          .limit(500);
      });

      const [object] = await withWorkspace(auto.workspaceId, (tx) =>
        tx
          .select()
          .from(objectDefinitions)
          .where(eq(objectDefinitions.id, auto.objectId))
          .limit(1),
      );
      if (!object) {
        continue;
      }

      for (const record of candidates) {
        await this.runAutomation(auto, {
          type: 'record.updated',
          workspaceId: auto.workspaceId,
          objectId: auto.objectId,
          objectApiName: object.apiName,
          recordId: record.id,
          actorUserId: auto.createdBy,
          record: {
            id: record.id,
            name: record.name,
            ownerId: record.ownerId,
            data: record.data,
          },
          source: 'system',
        });
      }
    }
  }

  private async loadAllDateReachedAutomations() {
    const ids =
      this.env.NODE_ENV === 'test'
        ? AutomationsService.testWorkspaceIds
        : AutomationsService.registeredWorkspaceIds;
    const result: Array<typeof automations.$inferSelect> = [];
    for (const workspaceId of ids) {
      const rows = await withWorkspace(workspaceId, (tx) =>
        tx.select().from(automations).where(eq(automations.isActive, true)),
      );
      result.push(
        ...rows.filter((row) => (row.trigger as AutomationTrigger).type === 'date_reached'),
      );
    }
    return result;
  }

  static readonly testWorkspaceIds: string[] = [];
  static readonly registeredWorkspaceIds: string[] = [];

  registerWorkspaceForDateScan(workspaceId: string): void {
    if (!AutomationsService.registeredWorkspaceIds.includes(workspaceId)) {
      AutomationsService.registeredWorkspaceIds.push(workspaceId);
    }
    if (
      this.env.NODE_ENV === 'test' &&
      !AutomationsService.testWorkspaceIds.includes(workspaceId)
    ) {
      AutomationsService.testWorkspaceIds.push(workspaceId);
    }
  }

  private async runAutomation(
    automation: typeof automations.$inferSelect,
    event: DomainEvent,
  ): Promise<void> {
    if (!event.record) {
      return;
    }

    const allowed = await this.loopGuard.tryAcquire(
      event.workspaceId,
      automation.id,
      event.recordId,
    );

    const runRow = await withWorkspace(event.workspaceId, async (tx) => {
      const [row] = await tx
        .insert(automationRuns)
        .values({
          workspaceId: event.workspaceId,
          automationId: automation.id,
          recordId: event.recordId,
          triggerEvent: event.type,
          status: allowed ? 'running' : 'skipped',
          startedAt: new Date(),
          actionResults: allowed
            ? []
            : [{ type: 'loop_protection', ok: false, error: 'Loop limit exceeded' }],
          finishedAt: allowed ? null : new Date(),
        })
        .returning();
      return row;
    });

    if (!allowed || !runRow) {
      return;
    }

    const conditions = automation.conditions
      ? filterGroupSchema.safeParse(automation.conditions)
      : null;
    if (conditions && conditions.success && conditions.data) {
      const matches = await this.recordMatchesFilter(
        event.workspaceId,
        automation.objectId,
        event.recordId,
        conditions.data,
      );
      if (!matches) {
        await withWorkspace(event.workspaceId, (tx) =>
          tx
            .update(automationRuns)
            .set({
              status: 'skipped',
              actionResults: [{ type: 'conditions', ok: false, error: 'Conditions not met' }],
              finishedAt: new Date(),
            })
            .where(eq(automationRuns.id, runRow.id)),
        );
        return;
      }
    }

    const actions = automation.actions as AutomationAction[];
    const actionResults: Record<string, unknown>[] = [];
    let failed = false;

    for (const action of actions) {
      try {
        const result = await this.executeAction(action, event, automation);
        actionResults.push({ type: action.type, ok: true, ...result });
      } catch (error) {
        failed = true;
        actionResults.push({
          type: action.type,
          ok: false,
          error: error instanceof Error ? error.message : 'action failed',
        });
        break;
      }
    }

    await withWorkspace(event.workspaceId, (tx) =>
      tx
        .update(automationRuns)
        .set({
          status: failed ? 'failed' : 'succeeded',
          actionResults,
          finishedAt: new Date(),
          error: failed ? 'One or more actions failed' : null,
        })
        .where(eq(automationRuns.id, runRow.id)),
    );
  }

  private async executeAction(
    action: AutomationAction,
    event: DomainEvent,
    automation: typeof automations.$inferSelect,
  ): Promise<Record<string, unknown>> {
    const record = event.record!;
    switch (action.type) {
      case 'update_field': {
        await withWorkspace(
          event.workspaceId,
          async (tx) => {
            const [existing] = await tx
              .select()
              .from(records)
              .where(and(eq(records.id, event.recordId), isNull(records.deletedAt)))
              .limit(1);
            if (!existing) {
              throw new NotFoundException('Record not found');
            }
            const nextData = { ...existing.data, [action.field]: action.value };
            await tx
              .update(records)
              .set({ data: nextData, updatedAt: new Date() })
              .where(eq(records.id, event.recordId));
          },
          { userId: event.actorUserId },
        );
        return { field: action.field };
      }
      case 'create_task': {
        const subject = renderTemplate(action.subject, record);
        const body = action.body ? renderTemplate(action.body, record) : undefined;
        const created = await this.activities.createForAutomation({
          workspaceId: event.workspaceId,
          objectId: event.objectId,
          objectApiName: event.objectApiName,
          recordId: event.recordId,
          actorUserId: event.actorUserId,
          subject,
          body,
          ownerId: action.ownerId ?? record.ownerId,
          dueAt: action.dueAt,
          record,
        });
        return { activityId: created.id };
      }
      case 'send_email': {
        const to = renderTemplate(action.to, record);
        const subject = renderTemplate(action.subject, record);
        const body = renderTemplate(action.body, record);
        await this.email.send({ to, subject, text: body });
        return { to };
      }
      case 'call_webhook': {
        if (action.subscriptionId) {
          await this.webhooks.enqueueForSubscription(event.workspaceId, action.subscriptionId, {
            ...event,
            type: 'record.updated',
            source: 'automation',
            automationId: automation.id,
          });
          return { subscriptionId: action.subscriptionId };
        }
        if (!action.url) {
          throw new BadRequestException('call_webhook requires url or subscriptionId');
        }
        const result = await this.webhooks.deliverAdHoc({
          workspaceId: event.workspaceId,
          url: action.url,
          signingSecret: 'automation',
          event: event.type,
          payload: {
            type: 'automation.webhook',
            automationId: automation.id,
            recordId: event.recordId,
            record,
          },
        });
        if (!result.ok) {
          throw new Error(result.bodyPreview ?? 'Webhook call failed');
        }
        return { status: result.status };
      }
    }
  }

  private triggerMatches(trigger: AutomationTrigger, event: DomainEvent): boolean {
    switch (trigger.type) {
      case 'record_created':
        return event.type === 'record.created';
      case 'stage_changed': {
        if (event.type !== 'record.stage_changed' || !event.record) {
          return false;
        }
        if (trigger.to === undefined) {
          return true;
        }
        return event.record.data.stage === trigger.to;
      }
      case 'field_changed': {
        if (event.type !== 'record.updated' && event.type !== 'record.stage_changed') {
          return false;
        }
        if (!event.record || !event.previousData) {
          return false;
        }
        const before = event.previousData[trigger.field];
        const after = event.record.data[trigger.field];
        if (before === after) {
          return false;
        }
        if (trigger.to === undefined) {
          return true;
        }
        return after === trigger.to;
      }
      case 'date_reached':
        return false; // handled by daily scan
    }
  }

  private async recordMatchesFilter(
    workspaceId: string,
    objectId: string,
    recordId: string,
    filter: FilterGroup,
  ): Promise<boolean> {
    return withWorkspace(workspaceId, async (tx) => {
      const fieldRows = await tx
        .select()
        .from(fieldDefinitions)
        .where(and(eq(fieldDefinitions.objectId, objectId), isNull(fieldDefinitions.deletedAt)));
      const fields = fieldRows.map((row) => ({
        id: row.id,
        objectId: row.objectId,
        apiName: row.apiName,
        label: row.label,
        type: row.type as never,
        required: row.required,
        isUnique: row.isUnique,
        isSystem: row.isSystem,
        options: (row.options ?? {}) as never,
        position: row.position,
        isIndexed: row.isIndexed,
        deletedAt: row.deletedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
      const compiled = compileFilter(filter, fields);
      const conditions = [
        sql`id = ${recordId}::uuid`,
        sql`object_id = ${objectId}::uuid`,
        sql`deleted_at is null`,
      ];
      if (compiled.sql) {
        conditions.push(compiled.sql);
      }
      const rows = await tx
        .select({ id: records.id })
        .from(records)
        .where(sql.join(conditions, sql` and `))
        .limit(1);
      return rows.length > 0;
    });
  }

  private assertActionsValid(actions: AutomationAction[]): void {
    for (const action of actions) {
      if (action.type === 'call_webhook' && !action.url && !action.subscriptionId) {
        throw new BadRequestException('call_webhook requires url or subscriptionId');
      }
    }
  }

  private toDto(row: typeof automations.$inferSelect): AutomationDto {
    return automationSchema.parse({
      id: row.id,
      objectId: row.objectId,
      name: row.name,
      trigger: row.trigger,
      conditions: row.conditions,
      actions: row.actions,
      isActive: row.isActive,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toRunDto(row: typeof automationRuns.$inferSelect): AutomationRunDto {
    return automationRunSchema.parse({
      id: row.id,
      automationId: row.automationId,
      recordId: row.recordId,
      triggerEvent: row.triggerEvent,
      status: row.status,
      actionResults: row.actionResults,
      error: row.error,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdAt: row.createdAt,
    });
  }
}
