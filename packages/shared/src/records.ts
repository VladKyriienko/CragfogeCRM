import { z } from 'zod';

export const filterOperatorSchema = z.enum([
  'eq',
  'neq',
  'contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'is_empty',
  'is_not_empty',
  'before',
  'after',
]);
export type FilterOperator = z.infer<typeof filterOperatorSchema>;

export const filterConditionSchema = z.object({
  field: z.string().min(1),
  op: filterOperatorSchema,
  value: z.unknown().optional(),
});
export type FilterCondition = z.infer<typeof filterConditionSchema>;

export const filterGroupSchema: z.ZodType<{
  and?: Array<FilterCondition | FilterGroup>;
  or?: Array<FilterCondition | FilterGroup>;
}> = z.lazy(() =>
  z
    .object({
      and: z.array(z.union([filterConditionSchema, filterGroupSchema])).optional(),
      or: z.array(z.union([filterConditionSchema, filterGroupSchema])).optional(),
    })
    .refine((value) => Boolean(value.and?.length || value.or?.length), {
      message: 'Filter group must include and/or',
    }),
);
export type FilterGroup = z.infer<typeof filterGroupSchema>;

export const sortDirectionSchema = z.enum(['asc', 'desc']);
export const recordSortSchema = z.object({
  field: z.string().min(1),
  direction: sortDirectionSchema.default('asc'),
});
export type RecordSort = z.infer<typeof recordSortSchema>;

export const listRecordsQuerySchema = z.object({
  filter: filterGroupSchema.optional(),
  sort: recordSortSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().max(200).optional(),
});
export type ListRecordsQuery = z.infer<typeof listRecordsQuerySchema>;

export const currencyValueSchema = z.object({
  amount: z.number().int(),
  currency: z.string().length(3),
});

export const createRecordBodySchema = z.object({
  name: z.string().min(1).max(500),
  data: z.record(z.unknown()).default({}),
  relations: z.record(z.union([z.string().uuid(), z.array(z.string().uuid())])).optional(),
  ownerId: z.string().min(1).optional(),
});
export type CreateRecordBody = z.infer<typeof createRecordBodySchema>;

export const updateRecordBodySchema = z.object({
  name: z.string().min(1).max(500).optional(),
  data: z.record(z.unknown()).optional(),
  relations: z.record(z.union([z.string().uuid(), z.array(z.string().uuid())])).optional(),
  ownerId: z.string().min(1).optional(),
});
export type UpdateRecordBody = z.infer<typeof updateRecordBodySchema>;

export const recordSchema = z.object({
  id: z.string().uuid(),
  objectId: z.string().uuid(),
  name: z.string(),
  ownerId: z.string(),
  data: z.record(z.unknown()),
  relations: z.record(z.array(z.string().uuid())).default({}),
  createdBy: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type RecordDto = z.infer<typeof recordSchema>;

export const listRecordsResponseSchema = z.object({
  items: z.array(recordSchema),
  nextCursor: z.string().nullable(),
});
export type ListRecordsResponse = z.infer<typeof listRecordsResponseSchema>;

export const bulkDeleteBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
});
export type BulkDeleteBody = z.infer<typeof bulkDeleteBodySchema>;

export const bulkUpdateBodySchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  data: z.record(z.unknown()),
});
export type BulkUpdateBody = z.infer<typeof bulkUpdateBodySchema>;

export const bulkOperationErrorSchema = z.object({
  id: z.string().uuid(),
  message: z.string(),
});
export type BulkOperationError = z.infer<typeof bulkOperationErrorSchema>;

export const bulkOperationResultSchema = z.object({
  succeededIds: z.array(z.string().uuid()),
  errors: z.array(bulkOperationErrorSchema),
});
export type BulkOperationResult = z.infer<typeof bulkOperationResultSchema>;
