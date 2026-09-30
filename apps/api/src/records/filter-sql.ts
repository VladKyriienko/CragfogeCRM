import { sql, type SQL } from '@cragfoge/db';
import {
  operatorsForType,
  type FieldDefinitionDto,
  type FieldType,
  type FilterCondition,
  type FilterGroup,
  type FilterOperator,
} from '@cragfoge/shared';
import { DomainError } from '../common/errors/domain-error';

const SYSTEM_SORT_FIELDS = new Set(['name', 'created_at', 'updated_at', 'owner_id']);

export type CompiledFilter = {
  sql: SQL | undefined;
  relationExists: Array<{ fieldId: string; toRecordIds: string[]; negate: boolean }>;
};

function isCondition(value: FilterCondition | FilterGroup): value is FilterCondition {
  return 'field' in value && 'op' in value;
}

function jsonText(apiName: string): SQL {
  // apiName is whitelisted from metadata before this is called.
  return sql`(data ->> ${apiName})`;
}

function jsonRaw(apiName: string): SQL {
  return sql`(data -> ${apiName})`;
}

function currencyAmount(apiName: string): SQL {
  return sql`((data -> ${apiName} ->> 'amount')::numeric)`;
}

function compileCondition(
  condition: FilterCondition,
  fieldsByApiName: Map<string, FieldDefinitionDto>,
): { sql?: SQL; relation?: CompiledFilter['relationExists'][number] } {
  if (condition.field === 'name') {
    return { sql: compileSystemText('name', condition.op, condition.value) };
  }
  if (condition.field === 'owner_id') {
    return { sql: compileSystemText('owner_id', condition.op, condition.value) };
  }
  if (condition.field === 'created_at' || condition.field === 'updated_at') {
    return { sql: compileSystemTimestamp(condition.field, condition.op, condition.value) };
  }

  const field = fieldsByApiName.get(condition.field);
  if (!field) {
    throw new DomainError('invalid_filter', `Unknown filter field "${condition.field}"`, 400);
  }
  if (!operatorsForType(field.type).has(condition.op)) {
    throw new DomainError(
      'invalid_filter',
      `Operator "${condition.op}" is not allowed for type "${field.type}"`,
      400,
    );
  }

  if (field.type === 'relation') {
    return { relation: compileRelation(field, condition.op, condition.value) };
  }

  return { sql: compileDataField(field.type, field.apiName, condition.op, condition.value) };
}

function compileSystemText(column: 'name' | 'owner_id', op: FilterOperator, value: unknown): SQL {
  const col = column === 'name' ? sql`name` : sql`owner_id`;
  switch (op) {
    case 'eq':
      return sql`${col} = ${String(value)}`;
    case 'neq':
      return sql`${col} <> ${String(value)}`;
    case 'contains':
      return sql`${col} ilike ${'%' + String(value) + '%'}`;
    case 'in':
      if (!Array.isArray(value) || value.length === 0) {
        throw new DomainError('invalid_filter', 'in requires a non-empty array', 400);
      }
      return sql`${col} in ${value.map(String)}`;
    case 'is_empty':
      return sql`(${col} is null or ${col} = '')`;
    case 'is_not_empty':
      return sql`(${col} is not null and ${col} <> '')`;
    default:
      throw new DomainError('invalid_filter', `Unsupported op ${op} for ${column}`, 400);
  }
}

function compileSystemTimestamp(
  column: 'created_at' | 'updated_at',
  op: FilterOperator,
  value: unknown,
): SQL {
  const col = column === 'created_at' ? sql`created_at` : sql`updated_at`;
  const ts = new Date(String(value));
  if (Number.isNaN(ts.getTime())) {
    throw new DomainError('invalid_filter', 'Invalid timestamp value', 400);
  }
  switch (op) {
    case 'eq':
      return sql`${col} = ${ts}`;
    case 'neq':
      return sql`${col} <> ${ts}`;
    case 'gt':
    case 'after':
      return sql`${col} > ${ts}`;
    case 'gte':
      return sql`${col} >= ${ts}`;
    case 'lt':
    case 'before':
      return sql`${col} < ${ts}`;
    case 'lte':
      return sql`${col} <= ${ts}`;
    case 'is_empty':
      return sql`${col} is null`;
    case 'is_not_empty':
      return sql`${col} is not null`;
    default:
      throw new DomainError('invalid_filter', `Unsupported op ${op} for timestamp`, 400);
  }
}

function compileRelation(
  field: FieldDefinitionDto,
  op: FilterOperator,
  value: unknown,
): CompiledFilter['relationExists'][number] {
  switch (op) {
    case 'eq':
      return { fieldId: field.id, toRecordIds: [String(value)], negate: false };
    case 'neq':
      return { fieldId: field.id, toRecordIds: [String(value)], negate: true };
    case 'in':
      if (!Array.isArray(value) || value.length === 0) {
        throw new DomainError('invalid_filter', 'in requires a non-empty array', 400);
      }
      return { fieldId: field.id, toRecordIds: value.map(String), negate: false };
    case 'is_empty':
      return { fieldId: field.id, toRecordIds: [], negate: true };
    case 'is_not_empty':
      return { fieldId: field.id, toRecordIds: [], negate: false };
    default:
      throw new DomainError('invalid_filter', `Unsupported relation op ${op}`, 400);
  }
}

function compileDataField(
  type: FieldType,
  apiName: string,
  op: FilterOperator,
  value: unknown,
): SQL {
  const text = jsonText(apiName);
  const raw = jsonRaw(apiName);

  if (op === 'is_empty') {
    return sql`(${raw} is null or ${raw} = 'null'::jsonb or ${text} = '')`;
  }
  if (op === 'is_not_empty') {
    return sql`(${raw} is not null and ${raw} <> 'null'::jsonb and ${text} <> '')`;
  }

  if (type === 'number' || type === 'currency') {
    const expr = type === 'currency' ? currencyAmount(apiName) : sql`(${text})::numeric`;
    const num = Number(value);
    if (op !== 'in' && Number.isNaN(num)) {
      throw new DomainError('invalid_filter', 'Numeric filter value required', 400);
    }
    switch (op) {
      case 'eq':
        return sql`${expr} = ${num}`;
      case 'neq':
        return sql`${expr} <> ${num}`;
      case 'gt':
        return sql`${expr} > ${num}`;
      case 'gte':
        return sql`${expr} >= ${num}`;
      case 'lt':
        return sql`${expr} < ${num}`;
      case 'lte':
        return sql`${expr} <= ${num}`;
      case 'in': {
        if (!Array.isArray(value) || value.length === 0) {
          throw new DomainError('invalid_filter', 'in requires a non-empty array', 400);
        }
        return sql`${expr} in ${value.map(Number)}`;
      }
      default:
        throw new DomainError('invalid_filter', `Unsupported numeric op ${op}`, 400);
    }
  }

  if (type === 'boolean') {
    const bool = Boolean(value);
    switch (op) {
      case 'eq':
        return sql`(${text})::boolean = ${bool}`;
      case 'neq':
        return sql`(${text})::boolean <> ${bool}`;
      default:
        throw new DomainError('invalid_filter', `Unsupported boolean op ${op}`, 400);
    }
  }

  if (type === 'date' || type === 'datetime') {
    const cast = type === 'date' ? sql`(${text})::date` : sql`(${text})::timestamptz`;
    const right = String(value);
    switch (op) {
      case 'eq':
        return sql`${cast} = ${right}`;
      case 'neq':
        return sql`${cast} <> ${right}`;
      case 'gt':
      case 'after':
        return sql`${cast} > ${right}`;
      case 'gte':
        return sql`${cast} >= ${right}`;
      case 'lt':
      case 'before':
        return sql`${cast} < ${right}`;
      case 'lte':
        return sql`${cast} <= ${right}`;
      default:
        throw new DomainError('invalid_filter', `Unsupported date op ${op}`, 400);
    }
  }

  if (type === 'multi_select') {
    if (op === 'contains') {
      return sql`${raw} ? ${String(value)}`;
    }
    if (op === 'in') {
      if (!Array.isArray(value) || value.length === 0) {
        throw new DomainError('invalid_filter', 'in requires a non-empty array', 400);
      }
      return sql`${raw} ?| array[${sql.join(
        value.map((item) => sql`${String(item)}`),
        sql`, `,
      )}]`;
    }
  }

  switch (op) {
    case 'eq':
      return sql`${text} = ${String(value)}`;
    case 'neq':
      return sql`${text} <> ${String(value)}`;
    case 'contains':
      return sql`${text} ilike ${'%' + String(value) + '%'}`;
    case 'in': {
      if (!Array.isArray(value) || value.length === 0) {
        throw new DomainError('invalid_filter', 'in requires a non-empty array', 400);
      }
      return sql`${text} in ${value.map(String)}`;
    }
    default:
      throw new DomainError('invalid_filter', `Unsupported op ${op}`, 400);
  }
}

function compileNode(
  node: FilterCondition | FilterGroup,
  fieldsByApiName: Map<string, FieldDefinitionDto>,
): CompiledFilter {
  if (isCondition(node)) {
    const compiled = compileCondition(node, fieldsByApiName);
    return {
      sql: compiled.sql,
      relationExists: compiled.relation ? [compiled.relation] : [],
    };
  }

  const parts = node.and ?? node.or ?? [];
  const compiledParts = parts.map((part) => compileNode(part, fieldsByApiName));
  const sqlParts = compiledParts
    .map((part) => part.sql)
    .filter((part): part is SQL => Boolean(part));
  const relationExists = compiledParts.flatMap((part) => part.relationExists);

  if (sqlParts.length === 0) {
    return { sql: undefined, relationExists };
  }

  const joined =
    node.and !== undefined ? sql.join(sqlParts, sql` and `) : sql.join(sqlParts, sql` or `);
  return { sql: sql`(${joined})`, relationExists };
}

export function compileFilter(
  filter: FilterGroup | undefined,
  fields: FieldDefinitionDto[],
): CompiledFilter {
  if (!filter) {
    return { sql: undefined, relationExists: [] };
  }
  const fieldsByApiName = new Map(fields.map((field) => [field.apiName, field]));
  return compileNode(filter, fieldsByApiName);
}

export function compileSort(
  sort: { field: string; direction: 'asc' | 'desc' } | undefined,
  fields: FieldDefinitionDto[],
): SQL {
  const directionSql = sort?.direction === 'asc' ? sql.raw('asc') : sql.raw('desc');
  const fieldName = sort?.field ?? 'created_at';

  if (SYSTEM_SORT_FIELDS.has(fieldName)) {
    if (fieldName === 'name') return sql`name ${directionSql}, id ${directionSql}`;
    if (fieldName === 'owner_id') return sql`owner_id ${directionSql}, id ${directionSql}`;
    if (fieldName === 'updated_at') return sql`updated_at ${directionSql}, id ${directionSql}`;
    return sql`created_at ${directionSql}, id ${directionSql}`;
  }

  const field = fields.find((item) => item.apiName === fieldName);
  if (!field) {
    throw new DomainError('invalid_sort', `Unknown sort field "${fieldName}"`, 400);
  }
  if (field.type === 'relation') {
    throw new DomainError('invalid_sort', 'Cannot sort by relation fields', 400);
  }
  if (field.type === 'number' || field.type === 'currency') {
    const expr =
      field.type === 'currency'
        ? currencyAmount(field.apiName)
        : sql`(${jsonText(field.apiName)})::numeric`;
    return sql`${expr} ${directionSql} nulls last, id ${directionSql}`;
  }
  return sql`${jsonText(field.apiName)} ${directionSql} nulls last, id ${directionSql}`;
}
