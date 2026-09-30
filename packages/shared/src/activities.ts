import { z } from 'zod';

export const activityTypeSchema = z.enum(['task', 'note']);
export type ActivityType = z.infer<typeof activityTypeSchema>;

export const activityStatusSchema = z.enum(['open', 'done', 'cancelled']);
export type ActivityStatus = z.infer<typeof activityStatusSchema>;

export const createActivityBodySchema = z.object({
  type: activityTypeSchema.default('task'),
  subject: z.string().trim().min(1).max(500),
  body: z.string().max(10_000).optional(),
  ownerId: z.string().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  status: activityStatusSchema.optional(),
});
export type CreateActivityBody = z.infer<typeof createActivityBodySchema>;

export const updateActivityBodySchema = z.object({
  subject: z.string().trim().min(1).max(500).optional(),
  body: z.string().max(10_000).nullable().optional(),
  ownerId: z.string().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  status: activityStatusSchema.optional(),
});
export type UpdateActivityBody = z.infer<typeof updateActivityBodySchema>;

export const activitySchema = z.object({
  id: z.string().uuid(),
  recordId: z.string().uuid(),
  objectId: z.string().uuid(),
  type: activityTypeSchema,
  subject: z.string(),
  body: z.string().nullable(),
  ownerId: z.string(),
  dueAt: z.coerce.date().nullable(),
  status: activityStatusSchema,
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ActivityDto = z.infer<typeof activitySchema>;
