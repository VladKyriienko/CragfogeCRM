import type {
  FieldDefinitionWithVisibilityDto,
  MemberPickerItem,
  RecordDto,
} from '@cragfoge/shared';
import { Link } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { formatCurrencyValue, getChoices } from './field-utils';

export type ColumnDef = {
  key: string;
  label: string;
  field?: FieldDefinitionWithVisibilityDto;
};

export function buildColumnDefs(
  columnKeys: string[],
  fields: FieldDefinitionWithVisibilityDto[],
  t: (key: string) => string,
): ColumnDef[] {
  const byApiName = new Map(fields.map((field) => [field.apiName, field]));
  return columnKeys.map((key) => {
    if (key === 'name') return { key, label: t('records.columns.name') };
    if (key === 'owner_id') return { key, label: t('records.columns.owner') };
    const field = byApiName.get(key);
    return { key, label: field?.label ?? key, field };
  });
}

type Props = {
  column: ColumnDef;
  record: RecordDto;
  objectApiName: string;
  membersById: Map<string, MemberPickerItem>;
};

/** Read-only rendering of a record's value for a given column, used in the list table. */
export function RecordCellValue({ column, record, objectApiName, membersById }: Props) {
  if (column.key === 'name') {
    return (
      <Link
        to="/records/$objectApiName/$recordId"
        params={{ objectApiName, recordId: record.id }}
        className="font-medium text-foreground hover:underline"
      >
        {record.name}
      </Link>
    );
  }
  if (column.key === 'owner_id') {
    const member = membersById.get(record.ownerId);
    return <span>{member?.name ?? record.ownerId}</span>;
  }

  const field = column.field;
  if (!field) return null;

  if (field.type === 'relation') {
    const ids = record.relations[field.apiName] ?? [];
    return <span className="text-muted-foreground">{ids.length}</span>;
  }

  const value = record.data[field.apiName];
  if (value === undefined || value === null || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }

  switch (field.type) {
    case 'boolean':
      return <span>{value ? '✓' : '—'}</span>;
    case 'currency':
      return <span>{formatCurrencyValue(value)}</span>;
    case 'multi_select': {
      const choices = getChoices(field);
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1">
          {selected.map((item) => (
            <Badge key={item} variant="secondary">
              {choices.find((choice) => choice.value === item)?.label ?? item}
            </Badge>
          ))}
        </div>
      );
    }
    case 'select': {
      const choices = getChoices(field);
      return (
        <span>{choices.find((choice) => choice.value === value)?.label ?? String(value)}</span>
      );
    }
    case 'date':
      return <span>{String(value)}</span>;
    case 'datetime':
      return <span>{new Date(String(value)).toLocaleString()}</span>;
    case 'user': {
      const member = membersById.get(String(value));
      return <span>{member?.name ?? String(value)}</span>;
    }
    default:
      return <span>{String(value)}</span>;
  }
}
