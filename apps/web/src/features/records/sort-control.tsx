import type { FieldDefinitionWithVisibilityDto, RecordSort } from '@cragfoge/shared';
import { ArrowDownUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SORTABLE_SYSTEM_FIELDS = ['name', 'owner_id', 'created_at', 'updated_at'];

type Props = {
  fields: FieldDefinitionWithVisibilityDto[];
  value: RecordSort;
  onChange: (next: RecordSort) => void;
};

export function SortControl({ fields, value, onChange }: Props) {
  const { t } = useTranslation();
  const sortableFields = fields.filter((field) => field.type !== 'relation');

  return (
    <div className="flex items-center gap-2">
      <ArrowDownUp className="size-4 text-muted-foreground" />
      <Select value={value.field} onValueChange={(field) => onChange({ ...value, field })}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORTABLE_SYSTEM_FIELDS.map((field) => (
            <SelectItem key={field} value={field}>
              {t(
                `records.columns.${field === 'owner_id' ? 'owner' : field === 'created_at' ? 'createdAt' : field === 'updated_at' ? 'updatedAt' : 'name'}`,
              )}
            </SelectItem>
          ))}
          {sortableFields.map((field) => (
            <SelectItem key={field.apiName} value={field.apiName}>
              {field.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.direction}
        onValueChange={(direction) =>
          onChange({ ...value, direction: direction as 'asc' | 'desc' })
        }
      >
        <SelectTrigger className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="asc">{t('records.sort.asc')}</SelectItem>
          <SelectItem value="desc">{t('records.sort.desc')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
