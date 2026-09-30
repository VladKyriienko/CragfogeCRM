import { z } from 'zod';

export const gdprExportSchema = z.object({
  exportedAt: z.string().datetime(),
  record: z.object({
    id: z.string().uuid(),
    objectApiName: z.string(),
    name: z.string(),
    ownerId: z.string(),
    data: z.record(z.unknown()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
  relatedRecords: z.array(
    z.object({
      id: z.string().uuid(),
      objectApiName: z.string(),
      name: z.string(),
      direction: z.enum(['from', 'to']),
      fieldApiName: z.string(),
    }),
  ),
  activities: z.array(z.record(z.unknown())),
  files: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number(),
      storageKey: z.string(),
      createdAt: z.string().datetime(),
    }),
  ),
  audit: z.array(
    z.object({
      id: z.string().uuid(),
      action: z.string(),
      entityType: z.string().nullable(),
      entityId: z.string().nullable(),
      diff: z.record(z.unknown()).nullable(),
      createdAt: z.string().datetime(),
    }),
  ),
});

export type GdprExport = z.infer<typeof gdprExportSchema>;

export const gdprEraseResultSchema = z.object({
  deletedRecordId: z.string().uuid(),
  deletedFileIds: z.array(z.string().uuid()),
  deletedActivityIds: z.array(z.string().uuid()),
  redactedAuditIds: z.array(z.string().uuid()),
});

export type GdprEraseResult = z.infer<typeof gdprEraseResultSchema>;
