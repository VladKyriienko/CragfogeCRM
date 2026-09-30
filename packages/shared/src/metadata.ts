import { z } from 'zod';

export const fieldTypeSchema = z.enum([
  'text',
  'long_text',
  'number',
  'currency',
  'date',
  'datetime',
  'boolean',
  'select',
  'multi_select',
  'email',
  'phone',
  'url',
  'user',
  'relation',
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const apiNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case starting with a letter');

export const selectChoiceSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

export const relationOptionsSchema = z.object({
  relatedObjectApiName: apiNameSchema,
  cardinality: z.enum(['one', 'many']),
});

export const fieldOptionsSchema = z
  .object({
    maxLength: z.number().int().positive().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    precision: z.number().int().nonnegative().optional(),
    currencies: z.array(z.string().length(3)).optional(),
    choices: z.array(selectChoiceSchema).optional(),
    relatedObjectApiName: apiNameSchema.optional(),
    cardinality: z.enum(['one', 'many']).optional(),
  })
  .passthrough();

export const objectDefinitionSchema = z.object({
  id: z.string().uuid(),
  apiName: apiNameSchema,
  labelSingular: z.string().min(1),
  labelPlural: z.string().min(1),
  icon: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ObjectDefinitionDto = z.infer<typeof objectDefinitionSchema>;

export const fieldDefinitionSchema = z.object({
  id: z.string().uuid(),
  objectId: z.string().uuid(),
  apiName: apiNameSchema,
  label: z.string().min(1),
  type: fieldTypeSchema,
  required: z.boolean(),
  isUnique: z.boolean(),
  isSystem: z.boolean(),
  options: fieldOptionsSchema,
  position: z.number().int(),
  isIndexed: z.boolean(),
  deletedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type FieldDefinitionDto = z.infer<typeof fieldDefinitionSchema>;

/**
 * Field definition as returned to a specific caller: hidden fields are
 * omitted entirely before this schema is applied, so visibility is always
 * 'read' or 'write' here. Missing role field permissions default to 'write'.
 */
export const fieldDefinitionWithVisibilitySchema = fieldDefinitionSchema.extend({
  visibility: z.enum(['read', 'write']),
});
export type FieldDefinitionWithVisibilityDto = z.infer<typeof fieldDefinitionWithVisibilitySchema>;

export const createObjectBodySchema = z.object({
  apiName: apiNameSchema,
  labelSingular: z.string().min(1).max(120),
  labelPlural: z.string().min(1).max(120),
  icon: z.string().max(64).optional().nullable(),
});
export type CreateObjectBody = z.infer<typeof createObjectBodySchema>;

export const updateObjectBodySchema = z.object({
  labelSingular: z.string().min(1).max(120).optional(),
  labelPlural: z.string().min(1).max(120).optional(),
  icon: z.string().max(64).optional().nullable(),
});
export type UpdateObjectBody = z.infer<typeof updateObjectBodySchema>;

export const createFieldBodySchema = z.object({
  apiName: apiNameSchema,
  label: z.string().min(1).max(120),
  type: fieldTypeSchema,
  required: z.boolean().optional().default(false),
  isUnique: z.boolean().optional().default(false),
  options: fieldOptionsSchema.optional().default({}),
  position: z.number().int().optional(),
  isIndexed: z.boolean().optional().default(false),
});
export type CreateFieldBody = z.infer<typeof createFieldBodySchema>;

export const updateFieldBodySchema = z.object({
  label: z.string().min(1).max(120).optional(),
  required: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  options: fieldOptionsSchema.optional(),
  position: z.number().int().optional(),
  isIndexed: z.boolean().optional(),
});
export type UpdateFieldBody = z.infer<typeof updateFieldBodySchema>;
