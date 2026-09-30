import { randomBytes } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  webhookDeliveries,
  webhookSubscriptions,
  withWorkspace,
  type AppDatabase,
} from '@cragfoge/db';
import {
  createWebhookBodySchema,
  createdWebhookSchema,
  updateWebhookBodySchema,
  webhookDeliverySchema,
  webhookSubscriptionSchema,
  type CreateWebhookBody,
  type CreatedWebhookDto,
  type UpdateWebhookBody,
  type WebhookDeliveryDto,
  type WebhookSubscriptionDto,
} from '@cragfoge/shared';
import { AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/request-context';
import type { DomainEvent } from '../events/domain-events';
import { APP_DB } from '../tokens';
import { WebhookDeliveryWorker } from './webhook-delivery.worker';

@Injectable()
export class WebhooksService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDatabase,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(WebhookDeliveryWorker) private readonly deliveryWorker: WebhookDeliveryWorker,
  ) {}

  async list(ctx: RequestContext): Promise<WebhookSubscriptionDto[]> {
    const rows = await withWorkspace(ctx.workspaceId, (tx) =>
      tx.select().from(webhookSubscriptions),
    );
    return rows.map((row) => this.toSubscriptionDto(row));
  }

  async create(ctx: RequestContext, body: CreateWebhookBody): Promise<CreatedWebhookDto> {
    const input = createWebhookBodySchema.parse(body);
    const signingSecret = randomBytes(32).toString('hex');

    const created = await withWorkspace(
      ctx.workspaceId,
      async (tx) => {
        const [row] = await tx
          .insert(webhookSubscriptions)
          .values({
            workspaceId: ctx.workspaceId,
            url: input.url,
            signingSecret,
            events: input.events,
            objectId: input.objectId ?? null,
            createdBy: ctx.user.id,
          })
          .returning();
        if (!row) {
          throw new NotFoundException('Could not create webhook');
        }
        return row;
      },
      { userId: ctx.user.id },
    );

    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'webhook.create',
      entityType: 'webhook',
      entityId: created.id,
      diff: { url: created.url, events: created.events },
    });

    return createdWebhookSchema.parse({
      ...this.toSubscriptionDto(created),
      signingSecret,
    });
  }

  async update(
    ctx: RequestContext,
    id: string,
    body: UpdateWebhookBody,
  ): Promise<WebhookSubscriptionDto> {
    const input = updateWebhookBodySchema.parse(body);
    const updated = await withWorkspace(ctx.workspaceId, async (tx) => {
      const [row] = await tx
        .update(webhookSubscriptions)
        .set({
          url: input.url,
          events: input.events,
          objectId: input.objectId === undefined ? undefined : input.objectId,
          isActive: input.isActive,
          consecutiveFailures: input.isActive === true ? 0 : undefined,
          updatedAt: new Date(),
        })
        .where(eq(webhookSubscriptions.id, id))
        .returning();
      return row;
    });
    if (!updated) {
      throw new NotFoundException('Webhook not found');
    }
    return this.toSubscriptionDto(updated);
  }

  async remove(ctx: RequestContext, id: string): Promise<void> {
    const deleted = await withWorkspace(ctx.workspaceId, async (tx) => {
      const [row] = await tx
        .delete(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, id))
        .returning();
      return row;
    });
    if (!deleted) {
      throw new NotFoundException('Webhook not found');
    }
    await this.audit.log({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      action: 'webhook.delete',
      entityType: 'webhook',
      entityId: id,
      diff: { url: deleted.url },
    });
  }

  async listDeliveries(ctx: RequestContext, subscriptionId: string): Promise<WebhookDeliveryDto[]> {
    const rows = await withWorkspace(ctx.workspaceId, async (tx) => {
      const [sub] = await tx
        .select({ id: webhookSubscriptions.id })
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, subscriptionId))
        .limit(1);
      if (!sub) {
        return null;
      }
      return tx
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.subscriptionId, subscriptionId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(100);
    });
    if (!rows) {
      throw new NotFoundException('Webhook not found');
    }
    return rows.map((row) => this.toDeliveryDto(row));
  }

  async resend(
    ctx: RequestContext,
    subscriptionId: string,
    deliveryId: string,
  ): Promise<WebhookDeliveryDto> {
    const source = await withWorkspace(ctx.workspaceId, async (tx) => {
      const [row] = await tx
        .select()
        .from(webhookDeliveries)
        .where(
          and(
            eq(webhookDeliveries.id, deliveryId),
            eq(webhookDeliveries.subscriptionId, subscriptionId),
          ),
        )
        .limit(1);
      return row;
    });
    if (!source) {
      throw new NotFoundException('Delivery not found');
    }

    const created = await withWorkspace(ctx.workspaceId, async (tx) => {
      const [row] = await tx
        .insert(webhookDeliveries)
        .values({
          workspaceId: ctx.workspaceId,
          subscriptionId,
          event: source.event,
          payload: source.payload,
          status: 'pending',
        })
        .returning();
      if (!row) {
        throw new NotFoundException('Could not create delivery');
      }
      return row;
    });

    await this.deliveryWorker.enqueue({
      workspaceId: ctx.workspaceId,
      deliveryId: created.id,
    });

    return this.toDeliveryDto(created);
  }

  async enqueueForEvent(event: DomainEvent): Promise<void> {
    const subscriptions = await withWorkspace(event.workspaceId, (tx) =>
      tx.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.isActive, true)),
    );

    const matching = subscriptions.filter((sub) => {
      if (!sub.events.includes(event.type)) {
        return false;
      }
      if (sub.objectId && sub.objectId !== event.objectId) {
        return false;
      }
      return true;
    });

    const payload = {
      type: event.type,
      workspaceId: event.workspaceId,
      objectId: event.objectId,
      objectApiName: event.objectApiName,
      recordId: event.recordId,
      record: event.record ?? null,
      previousData: event.previousData ?? null,
      activity: event.activity ?? null,
      occurredAt: new Date().toISOString(),
    };

    for (const sub of matching) {
      const delivery = await withWorkspace(event.workspaceId, async (tx) => {
        const [row] = await tx
          .insert(webhookDeliveries)
          .values({
            workspaceId: event.workspaceId,
            subscriptionId: sub.id,
            event: event.type,
            payload,
            status: 'pending',
          })
          .returning();
        return row;
      });
      if (delivery) {
        await this.deliveryWorker.enqueue({
          workspaceId: event.workspaceId,
          deliveryId: delivery.id,
        });
      }
    }
  }

  /** Deliver to an ad-hoc URL (automation call_webhook action). */
  async deliverAdHoc(input: {
    workspaceId: string;
    url: string;
    signingSecret: string;
    event: string;
    payload: Record<string, unknown>;
  }): Promise<{ ok: boolean; status: number | null; bodyPreview: string | null }> {
    return this.deliveryWorker.deliverOnce({
      url: input.url,
      signingSecret: input.signingSecret,
      payload: input.payload,
    });
  }

  /** Enqueue a delivery for a specific subscription (automation call_webhook). */
  async enqueueForSubscription(
    workspaceId: string,
    subscriptionId: string,
    event: DomainEvent,
  ): Promise<void> {
    const sub = await withWorkspace(workspaceId, async (tx) => {
      const [row] = await tx
        .select()
        .from(webhookSubscriptions)
        .where(
          and(eq(webhookSubscriptions.id, subscriptionId), eq(webhookSubscriptions.isActive, true)),
        )
        .limit(1);
      return row;
    });
    if (!sub) {
      throw new NotFoundException('Webhook subscription not found or inactive');
    }

    const payload = {
      type: event.type,
      workspaceId: event.workspaceId,
      objectId: event.objectId,
      objectApiName: event.objectApiName,
      recordId: event.recordId,
      record: event.record ?? null,
      previousData: event.previousData ?? null,
      activity: event.activity ?? null,
      occurredAt: new Date().toISOString(),
      automationId: event.automationId ?? null,
    };

    const delivery = await withWorkspace(workspaceId, async (tx) => {
      const [row] = await tx
        .insert(webhookDeliveries)
        .values({
          workspaceId,
          subscriptionId,
          event: event.type,
          payload,
          status: 'pending',
        })
        .returning();
      return row;
    });
    if (delivery) {
      await this.deliveryWorker.enqueue({
        workspaceId,
        deliveryId: delivery.id,
      });
    }
  }

  private toSubscriptionDto(row: typeof webhookSubscriptions.$inferSelect): WebhookSubscriptionDto {
    return webhookSubscriptionSchema.parse({
      id: row.id,
      url: row.url,
      events: row.events,
      objectId: row.objectId,
      isActive: row.isActive,
      consecutiveFailures: row.consecutiveFailures,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  private toDeliveryDto(row: typeof webhookDeliveries.$inferSelect): WebhookDeliveryDto {
    return webhookDeliverySchema.parse({
      id: row.id,
      subscriptionId: row.subscriptionId,
      event: row.event,
      payload: row.payload,
      status: row.status,
      attemptCount: row.attemptCount,
      responseStatus: row.responseStatus,
      responseBodyPreview: row.responseBodyPreview,
      nextAttemptAt: row.nextAttemptAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
    });
  }
}
