import type { FieldDefinitionWithVisibilityDto } from '@cragfoge/shared';
import { Columns3, MoveDown, MoveUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = {
  fields: FieldDefinitionWithVisibilityDto[];
  columns: string[];
  onChange: (next: string[]) => void;
};

const SYSTEM_COLUMNS = ['name', 'owner_id'];

/** Lets the user show/hide and reorder list columns; selection is kept in local/view state. */
export function ColumnPicker({ fields, columns, onChange }: Props) {
  const { t } = useTranslation();
  const allKeys = [
    ...SYSTEM_COLUMNS,
    ...fields.filter((f) => f.type !== 'relation').map((f) => f.apiName),
  ];

  function label(key: string): string {
    if (key === 'name') return t('records.columns.name');
    if (key === 'owner_id') return t('records.columns.owner');
    return fields.find((f) => f.apiName === key)?.label ?? key;
  }

  function toggle(key: string, checked: boolean) {
    if (checked) {
      onChange([...columns, key]);
    } else {
      onChange(columns.filter((c) => c !== key));
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...columns];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 className="size-4" />
          {t('records.columns.picker')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end">
        <DropdownMenuLabel>{t('records.columns.visible')}</DropdownMenuLabel>
        {columns.map((key, index) => (
          <div key={key} className="flex items-center justify-between px-2 py-1 text-sm">
            <span>{label(key)}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => move(index, -1)}
              >
                <MoveUp className="size-3.5" />
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => move(index, 1)}
              >
                <MoveDown className="size-3.5" />
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => toggle(key, false)}
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('records.columns.hidden')}</DropdownMenuLabel>
        {allKeys
          .filter((key) => !columns.includes(key))
          .map((key) => (
            <DropdownMenuCheckboxItem
              key={key}
              checked={false}
              onCheckedChange={(checked) => toggle(key, checked === true)}
            >
              {label(key)}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
