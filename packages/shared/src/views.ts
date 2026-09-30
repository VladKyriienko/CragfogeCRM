import { z } from 'zod';
import { filterGroupSchema, recordSortSchema } from './records';

export const viewSchema = z.object({
  id: z.string().uuid(),
  objectId: z.string().uuid(),
  name: z.string().min(1).max(120),
  filters: filterGroupSchema.nullable(),
  sort: recordSortSchema.nullable(),
  columns: z.array(z.string()),
  isShared: z.boolean(),
  ownerId: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ViewDto = z.infer<typeof viewSchema>;

export const createViewBodySchema = z.object({
  name: z.string().min(1).max(120),
  filters: filterGroupSchema.optional().nullable(),
  sort: recordSortSchema.optional().nullable(),
  columns: z.array(z.string()).optional().default([]),
  isShared: z.boolean().optional().default(false),
});
export type CreateViewBody = z.infer<typeof createViewBodySchema>;

export const updateViewBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  filters: filterGroupSchema.optional().nullable(),
  sort: recordSortSchema.optional().nullable(),
  columns: z.array(z.string()).optional(),
  isShared: z.boolean().optional(),
});
export type UpdateViewBody = z.infer<typeof updateViewBodySchema>;
