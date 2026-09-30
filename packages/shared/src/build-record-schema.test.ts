import { describe, expect, it } from 'vitest';
import { buildRecordSchema, operatorsForType, type FieldType } from './index';

describe('buildRecordSchema', () => {
  it('validates typed fields and rejects unknown keys', () => {
    const schema = buildRecordSchema([
      {
        apiName: 'email',
        type: 'email',
        required: true,
        options: {},
        deletedAt: null,
      },
      {
        apiName: 'amount',
        type: 'currency',
        required: false,
        options: {},
        deletedAt: null,
      },
      {
        apiName: 'company',
        type: 'relation',
        required: false,
        options: { relatedObjectApiName: 'companies', cardinality: 'one' },
        deletedAt: null,
      },
    ]);

    expect(
      schema.safeParse({
        email: 'a@example.com',
        amount: { amount: 1000, currency: 'USD' },
      }).success,
    ).toBe(true);

    const invalid = schema.safeParse({ email: 'not-an-email' });
    expect(invalid.success).toBe(false);

    const unknown = schema.safeParse({ email: 'a@example.com', mystery: 1 });
    expect(unknown.success).toBe(false);
  });
});

describe('operatorsForType', () => {
  const cases: Array<[FieldType, string[]]> = [
    ['text', ['eq', 'neq', 'contains', 'in', 'is_empty', 'is_not_empty']],
    ['number', ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is_empty', 'is_not_empty']],
    [
      'date',
      ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'before', 'after', 'is_empty', 'is_not_empty'],
    ],
    ['boolean', ['eq', 'neq', 'is_empty', 'is_not_empty']],
    ['select', ['eq', 'neq', 'in', 'is_empty', 'is_not_empty']],
    ['multi_select', ['contains', 'in', 'is_empty', 'is_not_empty']],
    ['relation', ['eq', 'neq', 'in', 'is_empty', 'is_not_empty']],
  ];

  for (const [type, ops] of cases) {
    it(`lists operators for ${type}`, () => {
      expect([...operatorsForType(type)].sort()).toEqual([...ops].sort());
    });
  }
});
