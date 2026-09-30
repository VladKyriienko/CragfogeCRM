import { z } from 'zod';

export const webhookEventSchema = z.enum([
  'record.created',
  'record.updated',
  'record.deleted',
  'record.stage_changed',
  'activity.created',
]);
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const webhookDeliveryStatusSchema = z.enum(['pending', 'delivering', 'succeeded', 'failed']);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

export const createWebhookBodySchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(webhookEventSchema).min(1),
  objectId: z.string().uuid().nullable().optional(),
});
export type CreateWebhookBody = z.infer<typeof createWebhookBodySchema>;

export const updateWebhookBodySchema = z.object({
  url: z.string().url().max(2048).optional(),
  events: z.array(webhookEventSchema).min(1).optional(),
  objectId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWebhookBody = z.infer<typeof updateWebhookBodySchema>;

export const webhookSubscriptionSchema = z.object({
  id: z.string().uuid(),
  url: z.string(),
  events: z.array(webhookEventSchema),
  objectId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  consecutiveFailures: z.number().int(),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type WebhookSubscriptionDto = z.infer<typeof webhookSubscriptionSchema>;

export const createdWebhookSchema = webhookSubscriptionSchema.extend({
  signingSecret: z.string().min(1),
});
export type CreatedWebhookDto = z.infer<typeof createdWebhookSchema>;

export const webhookDeliverySchema = z.object({
  id: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  event: webhookEventSchema,
  payload: z.record(z.unknown()),
  status: webhookDeliveryStatusSchema,
  attemptCount: z.number().int(),
  responseStatus: z.number().int().nullable(),
  responseBodyPreview: z.string().nullable(),
  nextAttemptAt: z.coerce.date().nullable(),
  completedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type WebhookDeliveryDto = z.infer<typeof webhookDeliverySchema>;
