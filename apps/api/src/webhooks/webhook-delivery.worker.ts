import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { eq, webhookDeliveries, webhookSubscriptions, withWorkspace } from '@cragfoge/db';
import { shouldOwnQueues, shouldRunWorkers, type Env } from '../config/env';
import { ENV, REDIS } from '../tokens';
import { signWebhookPayload } from './webhook-signature';

export type WebhookDeliveryJob = {
  workspaceId: string;
  deliveryId: string;
};

const QUEUE_NAME = 'webhook-delivery';
const MAX_ATTEMPTS = 8;

@Injectable()
export class WebhookDeliveryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryWorker.name);
  private queue: Queue<WebhookDeliveryJob> | undefined;
  private worker: Worker<WebhookDeliveryJob> | undefined;
  private connection: IORedis | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: IORedis,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') {
      return;
    }
    const ownQueue = shouldOwnQueues(this.env);
    const runWorker = shouldRunWorkers(this.env);
    if (!ownQueue && !runWorker) {
      return;
    }
    this.connection = new IORedis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    if (ownQueue) {
      this.queue = new Queue(QUEUE_NAME, { connection: this.connection });
    }
    if (runWorker) {
      this.worker = new Worker(
        QUEUE_NAME,
        async (job) => {
          await this.process(job.data, job.attemptsMade + 1);
        },
        { connection: this.connection.duplicate() },
      );
      this.worker.on('failed', (job, error) => {
        this.logger.error(`Webhook delivery ${job?.id} failed: ${error.message}`);
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async enqueue(payload: WebhookDeliveryJob): Promise<void> {
    if (!this.queue) {
      // Tests: run all attempts inline with no backoff.
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const done = await this.process(payload, attempt);
        if (done) {
          return;
        }
      }
      return;
    }
    await this.queue.add('deliver', payload, {
      jobId: payload.deliveryId,
      removeOnComplete: true,
      attempts: MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: 2_000 },
    });
  }

  async deliverOnce(input: {
    url: string;
    signingSecret: string;
    payload: Record<string, unknown>;
  }): Promise<{ ok: boolean; status: number | null; bodyPreview: string | null }> {
    const body = JSON.stringify(input.payload);
    const signature = signWebhookPayload(input.signingSecret, body);
    try {
      const response = await fetch(input.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Cragfoge-Signature': signature,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        bodyPreview: text.slice(0, 500),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'delivery failed';
      return { ok: false, status: null, bodyPreview: message.slice(0, 500) };
    }
  }

  /** @returns true if terminal (success or disabled after final failure) */
  private async process(payload: WebhookDeliveryJob, attempt: number): Promise<boolean> {
    const { workspaceId, deliveryId } = payload;

    const context = await withWorkspace(workspaceId, async (tx) => {
      const [delivery] = await tx
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.id, deliveryId))
        .limit(1);
      if (!delivery || delivery.status === 'succeeded') {
        return null;
      }
      const [subscription] = await tx
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, delivery.subscriptionId))
        .limit(1);
      if (!subscription) {
        return null;
      }
      return { delivery, subscription };
    });

    if (!context) {
      return true;
    }

    await withWorkspace(workspaceId, async (tx) => {
      await tx
        .update(webhookDeliveries)
        .set({ status: 'delivering', attemptCount: attempt })
        .where(eq(webhookDeliveries.id, deliveryId));
    });

    const result = await this.deliverOnce({
      url: context.subscription.url,
      signingSecret: context.subscription.signingSecret,
      payload: context.delivery.payload,
    });

    if (result.ok) {
      await withWorkspace(workspaceId, async (tx) => {
        await tx
          .update(webhookDeliveries)
          .set({
            status: 'succeeded',
            attemptCount: attempt,
            responseStatus: result.status,
            responseBodyPreview: result.bodyPreview,
            completedAt: new Date(),
          })
          .where(eq(webhookDeliveries.id, deliveryId));
        await tx
          .update(webhookSubscriptions)
          .set({ consecutiveFailures: 0, updatedAt: new Date() })
          .where(eq(webhookSubscriptions.id, context.subscription.id));
      });
      return true;
    }

    const isFinal = attempt >= MAX_ATTEMPTS;
    await withWorkspace(workspaceId, async (tx) => {
      await tx
        .update(webhookDeliveries)
        .set({
          status: isFinal ? 'failed' : 'pending',
          attemptCount: attempt,
          responseStatus: result.status,
          responseBodyPreview: result.bodyPreview,
          completedAt: isFinal ? new Date() : null,
          nextAttemptAt: isFinal ? null : new Date(Date.now() + 2_000 * 2 ** (attempt - 1)),
        })
        .where(eq(webhookDeliveries.id, deliveryId));

      if (isFinal) {
        await tx
          .update(webhookSubscriptions)
          .set({
            isActive: false,
            consecutiveFailures: context.subscription.consecutiveFailures + 1,
            updatedAt: new Date(),
          })
          .where(eq(webhookSubscriptions.id, context.subscription.id));
      } else {
        await tx
          .update(webhookSubscriptions)
          .set({
            consecutiveFailures: context.subscription.consecutiveFailures + 1,
            updatedAt: new Date(),
          })
          .where(eq(webhookSubscriptions.id, context.subscription.id));
      }
    });

    if (!this.queue && !isFinal) {
      // Inline retry path continues in enqueue loop.
      return false;
    }

    if (!isFinal && this.queue) {
      // BullMQ will retry via attempts/backoff; throw to mark attempt failed.
      throw new Error(result.bodyPreview ?? 'Webhook delivery failed');
    }

    return true;
  }
}
