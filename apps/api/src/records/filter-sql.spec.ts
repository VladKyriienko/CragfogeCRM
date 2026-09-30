import { describe, expect, it } from 'vitest';
import type { FieldDefinitionDto } from '@cragfoge/shared';
import { DomainError } from '../common/errors/domain-error';
import { compileFilter } from './filter-sql';

function field(partial: Partial<FieldDefinitionDto> & Pick<FieldDefinitionDto, 'apiName' | 'type'>): FieldDefinitionDto {
  return {
    id: partial.id ?? '11111111-1111-4111-8111-111111111111',
    objectId: '22222222-2222-4222-8222-222222222222',
    apiName: partial.apiName,
    label: partial.label ?? partial.apiName,
    type: partial.type,
    required: false,
    isUnique: false,
    isSystem: false,
    options: partial.options ?? {},
    position: 0,
    isIndexed: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('compileFilter', () => {
  const fields = [
    field({ apiName: 'stage', type: 'select', options: { choices: [{ value: 'won', label: 'Won' }] } }),
    field({ apiName: 'amount', type: 'currency' }),
    field({ apiName: 'title', type: 'text' }),
    field({ apiName: 'active', type: 'boolean' }),
    field({ apiName: 'close_date', type: 'date' }),
    field({ apiName: 'tags', type: 'multi_select', options: { choices: [{ value: 'a', label: 'A' }] } }),
    field({
      id: '33333333-3333-4333-8333-333333333333',
      apiName: 'company',
      type: 'relation',
      options: { relatedObjectApiName: 'companies', cardinality: 'one' },
    }),
  ];

  it('compiles and/or groups for whitelisted fields', () => {
    const compiled = compileFilter(
      {
        and: [
          { field: 'stage', op: 'eq', value: 'won' },
          { field: 'amount', op: 'gte', value: 1000 },
        ],
      },
      fields,
    );
    expect(compiled.sql).toBeDefined();
    expect(compiled.relationExists).toEqual([]);
  });

  it('supports contains, in, is_empty, before/after, and relation ops', () => {
    expect(
      compileFilter({ and: [{ field: 'title', op: 'contains', value: 'acme' }] }, fields).sql,
    ).toBeDefined();
    expect(
      compileFilter({ and: [{ field: 'stage', op: 'in', value: ['won', 'lost'] }] }, fields).sql,
    ).toBeDefined();
    expect(
      compileFilter({ and: [{ field: 'title', op: 'is_empty' }] }, fields).sql,
    ).toBeDefined();
    expect(
      compileFilter({ and: [{ field: 'title', op: 'is_not_empty' }] }, fields).sql,
    ).toBeDefined();
    expect(
      compileFilter({ and: [{ field: 'close_date', op: 'before', value: '2026-01-01' }] }, fields)
        .sql,
    ).toBeDefined();
    expect(
      compileFilter({ and: [{ field: 'close_date', op: 'after', value: '2026-01-01' }] }, fields).sql,
    ).toBeDefined();
    expect(
      compileFilter({ and: [{ field: 'active', op: 'eq', value: true }] }, fields).sql,
    ).toBeDefined();
    expect(
      compileFilter({ and: [{ field: 'tags', op: 'contains', value: 'a' }] }, fields).sql,
    ).toBeDefined();
    expect(
      compileFilter(
        { and: [{ field: 'company', op: 'eq', value: '44444444-4444-4444-8444-444444444444' }] },
        fields,
      ).relationExists,
    ).toHaveLength(1);
    expect(
      compileFilter({ and: [{ field: 'company', op: 'is_empty' }] }, fields).relationExists[0]
        ?.negate,
    ).toBe(true);
  });

  it('rejects unknown fields and illegal operators', () => {
    expect(() =>
      compileFilter({ and: [{ field: 'nope', op: 'eq', value: 1 }] }, fields),
    ).toThrow(DomainError);
    expect(() =>
      compileFilter({ and: [{ field: 'active', op: 'contains', value: 'x' }] }, fields),
    ).toThrow(DomainError);
  });
});
