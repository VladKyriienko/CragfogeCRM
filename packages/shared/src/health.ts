import { z } from 'zod';

export const healthCheckStatusSchema = z.enum(['ok', 'error']);

export const healthResponseSchema = z.object({
  status: healthCheckStatusSchema,
  checks: z.object({
    database: healthCheckStatusSchema,
    redis: healthCheckStatusSchema,
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
