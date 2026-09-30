import { z } from 'zod';
import { filterGroupSchema, recordSortSchema } from './records';

export const exportJobStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type ExportJobStatus = z.infer<typeof exportJobStatusSchema>;

export const createExportJobBodySchema = z.object({
  filter: filterGroupSchema.optional(),
  sort: recordSortSchema.optional(),
  columns: z.array(z.string().min(1)).min(1).max(50),
});
export type CreateExportJobBody = z.infer<typeof createExportJobBodySchema>;

export const exportJobSchema = z.object({
  id: z.string().uuid(),
  objectId: z.string().uuid(),
  ownerId: z.string(),
  status: exportJobStatusSchema,
  filter: filterGroupSchema.nullable(),
  sort: recordSortSchema.nullable(),
  columns: z.array(z.string()),
  fileId: z.string().uuid().nullable(),
  downloadPath: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.coerce.date(),
  completedAt: z.coerce.date().nullable(),
});
export type ExportJobDto = z.infer<typeof exportJobSchema>;
