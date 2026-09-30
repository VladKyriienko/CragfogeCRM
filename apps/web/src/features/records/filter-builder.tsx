import {
  operatorsForType,
  type FieldDefinitionWithVisibilityDto,
  type FieldType,
  type FilterCondition,
  type FilterOperator,
} from '@cragfoge/shared';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getChoices } from './field-utils';

type FilterableField = {
  apiName: string;
  label: string;
  type: FieldType;
  field?: FieldDefinitionWithVisibilityDto;
};

const SYSTEM_FIELDS: FilterableField[] = [
  { apiName: 'name', label: 'Name', type: 'text' },
  { apiName: 'owner_id', label: 'Owner', type: 'user' },
  { apiName: 'created_at', label: 'Created at', type: 'datetime' },
  { apiName: 'updated_at', label: 'Updated at', type: 'datetime' },
];

export function filterableFields(fields: FieldDefinitionWithVisibilityDto[]): FilterableField[] {
  return [
    ...SYSTEM_FIELDS,
    ...fields.map((field) => ({
      apiName: field.apiName,
      label: field.label,
      type: field.type,
      field,
    })),
  ];
}

type Props = {
  fields: FieldDefinitionWithVisibilityDto[];
  value: FilterCondition[];
  onChange: (next: FilterCondition[]) => void;
};

export function FilterBuilder({ fields, value, onChange }: Props) {
  const { t } = useTranslation();
  const options = filterableFields(fields);

  function updateCondition(index: number, patch: Partial<FilterCondition>) {
    const next = value.map((condition, i) =>
      i === index ? { ...condition, ...patch } : condition,
    );
    onChange(next);
  }

  function addCondition() {
    const first = options[0];
    if (!first) return;
    const op = [...operatorsForType(first.type)][0] as FilterOperator;
    onChange([...value, { field: first.apiName, op, value: '' }]);
  }

  function removeCondition(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {value.map((condition, index) => {
        const option = options.find((item) => item.apiName === condition.field) ?? options[0];
        const ops = option ? [...operatorsForType(option.type)] : [];
        return (
          <div key={index} className="flex flex-wrap items-center gap-2">
            <Select
              value={condition.field}
              onValueChange={(next) => {
                const nextOption = options.find((item) => item.apiName === next);
                const nextOp = nextOption
                  ? ([...operatorsForType(nextOption.type)][0] as FilterOperator)
                  : condition.op;
                updateCondition(index, { field: next, op: nextOp, value: '' });
              }}
            >
              <SelectTrigger className="w-40" aria-label={t('records.filters.field')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((item) => (
                  <SelectItem key={item.apiName} value={item.apiName}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={condition.op}
              onValueChange={(next) => updateCondition(index, { op: next as FilterOperator })}
            >
              <SelectTrigger className="w-36" aria-label={t('records.filters.operator')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ops.map((op) => (
                  <SelectItem key={op} value={op}>
                    {t(`records.filters.operators.${op}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {condition.op !== 'is_empty' && condition.op !== 'is_not_empty' ? (
              <FilterValueInput
                option={option}
                op={condition.op}
                value={condition.value}
                onChange={(next) => updateCondition(index, { value: next })}
              />
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={() => removeCondition(index)}
            >
              <X className="size-4" />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={addCondition}>
        <Plus className="size-4" />
        {t('records.filters.add')}
      </Button>
    </div>
  );
}

function FilterValueInput({
  option,
  op,
  value,
  onChange,
}: {
  option: FilterableField | undefined;
  op: FilterOperator;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { t } = useTranslation();
  if (!option) return null;

  if (op === 'in') {
    const text = Array.isArray(value) ? value.join(', ') : '';
    return (
      <Input
        className="w-48"
        aria-label={t('records.filters.value')}
        placeholder={t('records.filters.commaSeparated')}
        value={text}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
      />
    );
  }

  if (option.type === 'boolean') {
    return (
      <Select
        value={value === true ? 'true' : 'false'}
        onValueChange={(next) => onChange(next === 'true')}
      >
        <SelectTrigger className="w-32" aria-label={t('records.filters.value')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">{t('common.true')}</SelectItem>
          <SelectItem value="false">{t('common.false')}</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (option.type === 'select' && option.field) {
    const choices = getChoices(option.field);
    return (
      <Select value={typeof value === 'string' ? value : ''} onValueChange={onChange}>
        <SelectTrigger className="w-40" aria-label={t('records.filters.value')}>
          <SelectValue placeholder={t('records.field.selectPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {choices.map((choice) => (
            <SelectItem key={choice.value} value={choice.value}>
              {choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (option.type === 'number' || option.type === 'currency') {
    return (
      <Input
        className="w-32"
        aria-label={t('records.filters.value')}
        type="number"
        value={typeof value === 'number' ? value : ''}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      />
    );
  }

  if (option.type === 'date') {
    return (
      <Input
        className="w-40"
        aria-label={t('records.filters.value')}
        type="date"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (option.type === 'datetime') {
    return (
      <Input
        className="w-44"
        aria-label={t('records.filters.value')}
        type="datetime-local"
        value={typeof value === 'string' ? value : ''}
        onChange={(event) =>
          onChange(event.target.value ? new Date(event.target.value).toISOString() : '')
        }
      />
    );
  }

  return (
    <Input
      className="w-40"
      aria-label={t('records.filters.value')}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
