import type { FieldDefinitionWithVisibilityDto } from '@cragfoge/shared';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useWorkspaceMembers } from '@/features/workspaces/use-workspace-members';
import { getChoices } from './field-utils';

type Props = {
  workspaceId: string | null;
  field: FieldDefinitionWithVisibilityDto;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  id?: string;
};

function toDateTimeLocal(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Renders the editable control for a single non-relation field, dispatched by field type. */
export function RecordFieldInput({ workspaceId, field, value, onChange, disabled, id }: Props) {
  const { t } = useTranslation();

  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
      return (
        <Input
          id={id}
          disabled={disabled}
          type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'long_text':
      return (
        <Textarea
          id={id}
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'number':
      return (
        <Input
          id={id}
          disabled={disabled}
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(event) =>
            onChange(event.target.value === '' ? null : Number(event.target.value))
          }
        />
      );
    case 'currency': {
      const currencyValue =
        typeof value === 'object' && value !== null && 'amount' in value
          ? (value as { amount: number; currency: string })
          : { amount: 0, currency: 'USD' };
      return (
        <div className="flex gap-2">
          <Input
            disabled={disabled}
            type="number"
            className="flex-1"
            value={currencyValue.amount / 100}
            onChange={(event) =>
              onChange({
                amount: Math.round(Number(event.target.value || 0) * 100),
                currency: currencyValue.currency,
              })
            }
          />
          <Input
            disabled={disabled}
            className="w-20"
            maxLength={3}
            value={currencyValue.currency}
            onChange={(event) =>
              onChange({ amount: currencyValue.amount, currency: event.target.value.toUpperCase() })
            }
          />
        </div>
      );
    }
    case 'date':
      return (
        <Input
          id={id}
          disabled={disabled}
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'datetime':
      return (
        <Input
          id={id}
          disabled={disabled}
          type="datetime-local"
          value={toDateTimeLocal(value)}
          onChange={(event) =>
            onChange(event.target.value ? new Date(event.target.value).toISOString() : '')
          }
        />
      );
    case 'boolean':
      return (
        <Checkbox
          id={id}
          disabled={disabled}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
      );
    case 'select': {
      const choices = getChoices(field);
      return (
        <Select
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onValueChange={(next) => onChange(next)}
        >
          <SelectTrigger id={id} aria-label={field.label}>
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
    case 'multi_select': {
      const choices = getChoices(field);
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1 rounded-md border p-2">
          {choices.map((choice) => {
            const checked = selected.includes(choice.value);
            return (
              <label key={choice.value} className="flex items-center gap-2 text-sm">
                <Checkbox
                  disabled={disabled}
                  checked={checked}
                  onCheckedChange={(next) => {
                    if (next) {
                      onChange([...selected, choice.value]);
                    } else {
                      onChange(selected.filter((item) => item !== choice.value));
                    }
                  }}
                />
                {choice.label}
              </label>
            );
          })}
        </div>
      );
    }
    case 'user':
      return (
        <UserFieldInput
          workspaceId={workspaceId}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      );
    default:
      return null;
  }
}

function UserFieldInput({
  workspaceId,
  value,
  onChange,
  disabled,
}: {
  workspaceId: string | null;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const members = useWorkspaceMembers(workspaceId);
  return (
    <Select
      disabled={disabled}
      value={typeof value === 'string' ? value : ''}
      onValueChange={onChange}
    >
      <SelectTrigger>
        <SelectValue placeholder={t('records.field.userPlaceholder')} />
      </SelectTrigger>
      <SelectContent>
        {(members.data ?? []).map((member) => (
          <SelectItem key={member.id} value={member.id}>
            {member.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
