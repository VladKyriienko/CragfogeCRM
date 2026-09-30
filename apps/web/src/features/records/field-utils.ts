import type { FieldDefinitionDto, FieldDefinitionWithVisibilityDto } from '@cragfoge/shared';

export type SelectChoice = { value: string; label: string };

export function getChoices(field: Pick<FieldDefinitionDto, 'options'>): SelectChoice[] {
  const choices = field.options.choices;
  if (!Array.isArray(choices)) return [];
  return choices.map((choice) => {
    if (typeof choice === 'object' && choice !== null && 'value' in choice) {
      const record = choice as { value: unknown; label?: unknown };
      const value = String(record.value);
      return { value, label: typeof record.label === 'string' ? record.label : value };
    }
    const value = String(choice);
    return { value, label: value };
  });
}

/** Default columns shown in the list view before the user customizes them. */
export function defaultColumns(fields: FieldDefinitionWithVisibilityDto[]): string[] {
  const ordered = [...fields]
    .filter((field) => field.type !== 'relation')
    .sort((a, b) => a.position - b.position)
    .slice(0, 5)
    .map((field) => field.apiName);
  return ['name', ...ordered, 'owner_id'];
}

export function formatCurrencyValue(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('amount' in value) ||
    !('currency' in value)
  ) {
    return '';
  }
  const { amount, currency } = value as { amount: number; currency: string };
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

export function isRecordFieldWritable(field: FieldDefinitionWithVisibilityDto): boolean {
  return field.visibility === 'write';
}
