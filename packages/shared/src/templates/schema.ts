import { z } from 'zod';
import { automationActionSchema, automationTriggerSchema } from '../automations';
import { fieldTypeSchema } from '../metadata';

export const industryTemplateIdSchema = z.enum([
  'generic-sales',
  'agency',
  'real-estate',
  'beauty-salon',
  'trades',
]);

export type IndustryTemplateId = z.infer<typeof industryTemplateIdSchema>;

const choiceSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

const templateFieldSchema = z.object({
  objectApiName: z.string().min(1),
  apiName: z.string().min(1),
  label: z.string().min(1),
  type: fieldTypeSchema,
  required: z.boolean().optional(),
  options: z
    .object({
      choices: z.array(choiceSchema).optional(),
      relatedObjectApiName: z.string().optional(),
      cardinality: z.enum(['one', 'many']).optional(),
    })
    .passthrough()
    .optional(),
  position: z.number().int().nonnegative(),
});

const templateObjectSchema = z.object({
  apiName: z.string().min(1),
  labelSingular: z.string().min(1),
  labelPlural: z.string().min(1),
  icon: z.string().min(1),
  isSystem: z.boolean().optional(),
});

const templateViewSchema = z.object({
  objectApiName: z.string().min(1),
  name: z.string().min(1),
  columns: z.array(z.string()).default([]),
  filters: z.record(z.unknown()).nullable().optional(),
  sort: z.record(z.unknown()).nullable().optional(),
  isShared: z.boolean().default(true),
});

const templateAutomationSchema = z.object({
  objectApiName: z.string().min(1),
  name: z.string().min(1),
  trigger: automationTriggerSchema,
  conditions: z.record(z.unknown()).nullable().optional(),
  actions: z.array(automationActionSchema).min(1),
  isActive: z.boolean().default(true),
});

const sampleRecordSchema = z.object({
  objectApiName: z.string().min(1),
  name: z.string().min(1),
  data: z.record(z.unknown()).default({}),
  /** Map relation field apiName → sample record name on the related object. */
  relations: z.record(z.string()).optional(),
});

export const industryTemplateSchema = z.object({
  id: industryTemplateIdSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  objects: z.array(templateObjectSchema).min(1),
  fields: z.array(templateFieldSchema),
  views: z.array(templateViewSchema).default([]),
  automations: z.array(templateAutomationSchema).default([]),
  sampleRecords: z.array(sampleRecordSchema).default([]),
});

export type IndustryTemplate = z.infer<typeof industryTemplateSchema>;

export const industryTemplateSummarySchema = z.object({
  id: industryTemplateIdSchema,
  name: z.string(),
  description: z.string(),
});

export type IndustryTemplateSummary = z.infer<typeof industryTemplateSummarySchema>;
