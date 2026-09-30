import { z } from 'zod';
import type { FieldDefinitionDto, FieldType } from './metadata';
import { currencyValueSchema } from './records';

export type RecordFieldMeta = Pick<
  FieldDefinitionDto,
  'apiName' | 'type' | 'required' | 'options' | 'deletedAt'
>;

const OPERATORS_BY_TYPE: Record<FieldType, ReadonlySet<string>> = {
  text: new Set(['eq', 'neq', 'contains', 'in', 'is_empty', 'is_not_empty']),
  long_text: new Set(['eq', 'neq', 'contains', 'is_empty', 'is_not_empty']),
  number: new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is_empty', 'is_not_empty']),
  currency: new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty']),
  date: new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'is_empty', 'is_not_empty']),
  datetime: new Set([
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'before',
    'after',
    'is_empty',
    'is_not_empty',
  ]),
  boolean: new Set(['eq', 'neq', 'is_empty', 'is_not_empty']),
  select: new Set(['eq', 'neq', 'in', 'is_empty', 'is_not_empty']),
  multi_select: new Set(['contains', 'in', 'is_empty', 'is_not_empty']),
  email: new Set(['eq', 'neq', 'contains', 'in', 'is_empty', 'is_not_empty']),
  phone: new Set(['eq', 'neq', 'contains', 'is_empty', 'is_not_empty']),
  url: new Set(['eq', 'neq', 'contains', 'is_empty', 'is_not_empty']),
  user: new Set(['eq', 'neq', 'in', 'is_empty', 'is_not_empty']),
  relation: new Set(['eq', 'neq', 'in', 'is_empty', 'is_not_empty']),
};

export function operatorsForType(type: FieldType): ReadonlySet<string> {
  return OPERATORS_BY_TYPE[type];
}

function stringSchema(required: boolean, maxLength?: number) {
  let schema = z.string();
  if (maxLength) {
    schema = schema.max(maxLength);
  }
  return required ? schema.min(1) : schema;
}

function fieldValueSchema(field: RecordFieldMeta): z.ZodTypeAny {
  const maxLength =
    typeof field.options.maxLength === 'number' ? field.options.maxLength : undefined;
  const choices = Array.isArray(field.options.choices)
    ? field.options.choices.map((choice) => {
        if (typeof choice === 'object' && choice !== null && 'value' in choice) {
          return String((choice as { value: unknown }).value);
        }
        return String(choice);
      })
    : [];

  switch (field.type) {
    case 'text':
    case 'phone':
      return stringSchema(field.required, maxLength ?? 500);
    case 'long_text':
      return stringSchema(field.required, maxLength ?? 10_000);
    case 'email':
      return field.required ? z.string().email() : z.string().email().or(z.literal(''));
    case 'url':
      return field.required ? z.string().url() : z.string().url().or(z.literal(''));
    case 'number': {
      let schema = z.number();
      if (typeof field.options.min === 'number') {
        schema = schema.min(field.options.min);
      }
      if (typeof field.options.max === 'number') {
        schema = schema.max(field.options.max);
      }
      return schema;
    }
    case 'currency':
      return currencyValueSchema;
    case 'date':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
    case 'datetime':
      return z.string().min(1);
    case 'boolean':
      return z.boolean();
    case 'select':
      return choices.length > 0 ? z.enum(choices as [string, ...string[]]) : z.string().min(1);
    case 'multi_select': {
      const item =
        choices.length > 0 ? z.enum(choices as [string, ...string[]]) : z.string().min(1);
      return z.array(item);
    }
    case 'user':
      return z.string().min(1);
    case 'relation':
      // Relations are stored in record_relations, not data.
      return z.never();
    default: {
      const _exhaustive: never = field.type;
      return _exhaustive;
    }
  }
}

/**
 * Builds a Zod schema for records.data from active (non-deleted, non-relation) fields.
 * Unknown keys are stripped; required fields are enforced when present in metadata.
 */
export function buildRecordSchema(fields: readonly RecordFieldMeta[]): z.ZodObject<
  Record<string, z.ZodTypeAny>
> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    if (field.deletedAt || field.type === 'relation') {
      continue;
    }
    const valueSchema = fieldValueSchema(field);
    shape[field.apiName] = field.required ? valueSchema : valueSchema.optional().nullable();
  }
  return z.object(shape).strict();
}
