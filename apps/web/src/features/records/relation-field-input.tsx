import type { FieldDefinitionWithVisibilityDto } from '@cragfoge/shared';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRecords } from './use-records';

type Props = {
  workspaceId: string | null;
  field: FieldDefinitionWithVisibilityDto;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

/** Picker for relation fields: a single-select for cardinality "one", checkboxes for "many". */
export function RelationFieldInput({ workspaceId, field, value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const relatedObjectApiName =
    typeof field.options.relatedObjectApiName === 'string'
      ? field.options.relatedObjectApiName
      : '';
  const cardinality = field.options.cardinality === 'many' ? 'many' : 'one';
  const records = useRecords(workspaceId, relatedObjectApiName, { limit: 100 });
  const options = records.data?.pages.flatMap((page) => page.items) ?? [];

  if (cardinality === 'one') {
    return (
      <Select
        disabled={disabled}
        value={value[0] ?? ''}
        onValueChange={(next) => onChange(next ? [next] : [])}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('records.field.relationPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('records.field.relationEmpty')}</p>
      ) : null}
      {options.map((option) => {
        const checked = value.includes(option.id);
        return (
          <label key={option.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              disabled={disabled}
              checked={checked}
              onCheckedChange={(next) => {
                if (next) {
                  onChange([...value, option.id]);
                } else {
                  onChange(value.filter((id) => id !== option.id));
                }
              }}
            />
            {option.name}
          </label>
        );
      })}
    </div>
  );
}
