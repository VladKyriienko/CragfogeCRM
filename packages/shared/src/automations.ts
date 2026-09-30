import { z } from 'zod';
import { filterGroupSchema } from './records';

export const automationTriggerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('record_created') }),
  z.object({
    type: z.literal('field_changed'),
    field: z.string().min(1),
    to: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('stage_changed'),
    to: z.unknown().optional(),
  }),
  z.object({
    type: z.literal('date_reached'),
    field: z.string().min(1),
  }),
]);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;

export const automationActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('update_field'),
    field: z.string().min(1),
    value: z.unknown(),
  }),
  z.object({
    type: z.literal('create_task'),
    subject: z.string().min(1).max(500),
    body: z.string().max(5000).optional(),
    /** Defaults to record owner when omitted. */
    ownerId: z.string().optional(),
    dueAt: z.string().datetime().optional(),
  }),
  z.object({
    type: z.literal('send_email'),
    to: z.string().min(1).max(500),
    subject: z.string().min(1).max(500),
    body: z.string().min(1).max(20_000),
  }),
  z.object({
    type: z.literal('call_webhook'),
    url: z.string().url().max(2048).optional(),
    subscriptionId: z.string().uuid().optional(),
  }),
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const createAutomationBodySchema = z.object({
  objectId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  trigger: automationTriggerSchema,
  conditions: filterGroupSchema.nullable().optional(),
  actions: z.array(automationActionSchema).min(1).max(20),
  isActive: z.boolean().optional(),
});
export type CreateAutomationBody = z.infer<typeof createAutomationBodySchema>;

export const updateAutomationBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  trigger: automationTriggerSchema.optional(),
  conditions: filterGroupSchema.nullable().optional(),
  actions: z.array(automationActionSchema).min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateAutomationBody = z.infer<typeof updateAutomationBodySchema>;

export const automationRunStatusSchema = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
]);
export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>;

export const automationSchema = z.object({
  id: z.string().uuid(),
  objectId: z.string().uuid(),
  name: z.string(),
  trigger: automationTriggerSchema,
  conditions: filterGroupSchema.nullable(),
  actions: z.array(automationActionSchema),
  isActive: z.boolean(),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type AutomationDto = z.infer<typeof automationSchema>;

export const automationRunSchema = z.object({
  id: z.string().uuid(),
  automationId: z.string().uuid(),
  recordId: z.string().uuid().nullable(),
  triggerEvent: z.string(),
  status: automationRunStatusSchema,
  actionResults: z.array(z.record(z.unknown())),
  error: z.string().nullable(),
  startedAt: z.coerce.date().nullable(),
  finishedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type AutomationRunDto = z.infer<typeof automationRunSchema>;
