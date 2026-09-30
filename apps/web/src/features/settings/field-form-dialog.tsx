import {
  apiNameSchema,
  fieldTypeSchema,
  type CreateFieldBody,
  type FieldDefinitionWithVisibilityDto,
  type FieldType,
  type ObjectDefinitionDto,
} from '@cragfoge/shared';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const FIELD_TYPES = fieldTypeSchema.options;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objects: ObjectDefinitionDto[];
  currentObjectApiName: string;
  editingField?: FieldDefinitionWithVisibilityDto | null;
  onSubmit: (body: CreateFieldBody) => Promise<void> | void;
  isPending: boolean;
};

type Choice = { value: string; label: string };

export function FieldFormDialog({
  open,
  onOpenChange,
  objects,
  currentObjectApiName,
  editingField,
  onSubmit,
  isPending,
}: Props) {
  const { t } = useTranslation();
  const [apiName, setApiName] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('text');
  const [required, setRequired] = useState(false);
  const [isUnique, setIsUnique] = useState(false);
  const [isIndexed, setIsIndexed] = useState(false);
  const [choices, setChoices] = useState<Choice[]>([{ value: '', label: '' }]);
  const [relatedObjectApiName, setRelatedObjectApiName] = useState('');
  const [cardinality, setCardinality] = useState<'one' | 'many'>('one');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editingField) {
      setApiName(editingField.apiName);
      setLabel(editingField.label);
      setType(editingField.type);
      setRequired(editingField.required);
      setIsUnique(editingField.isUnique);
      setIsIndexed(editingField.isIndexed);
      const existingChoices = editingField.options.choices;
      setChoices(
        Array.isArray(existingChoices) && existingChoices.length > 0
          ? existingChoices.map((c) =>
              typeof c === 'object' && c !== null && 'value' in c
                ? {
                    value: String((c as { value: unknown }).value),
                    label: String((c as { label?: unknown }).label ?? ''),
                  }
                : { value: String(c), label: String(c) },
            )
          : [{ value: '', label: '' }],
      );
      setRelatedObjectApiName(
        typeof editingField.options.relatedObjectApiName === 'string'
          ? editingField.options.relatedObjectApiName
          : '',
      );
      setCardinality(editingField.options.cardinality === 'many' ? 'many' : 'one');
    } else {
      setApiName('');
      setLabel('');
      setType('text');
      setRequired(false);
      setIsUnique(false);
      setIsIndexed(false);
      setChoices([{ value: '', label: '' }]);
      setRelatedObjectApiName('');
      setCardinality('one');
    }
    setError(null);
  }, [open, editingField]);

  function buildOptions(): Record<string, unknown> {
    if (type === 'select' || type === 'multi_select') {
      return { choices: choices.filter((c) => c.value.trim().length > 0) };
    }
    if (type === 'relation') {
      return { relatedObjectApiName, cardinality };
    }
    return {};
  }

  async function handleSubmit() {
    setError(null);
    const apiNameResult = apiNameSchema.safeParse(apiName);
    if (!editingField && !apiNameResult.success) {
      setError(t('settings.objects.fields.errors.apiName'));
      return;
    }
    if (!label.trim()) {
      setError(t('settings.objects.fields.errors.label'));
      return;
    }
    if (
      (type === 'select' || type === 'multi_select') &&
      buildOptions().choices instanceof Array &&
      (buildOptions().choices as unknown[]).length === 0
    ) {
      setError(t('settings.objects.fields.errors.choices'));
      return;
    }
    if (type === 'relation' && !relatedObjectApiName) {
      setError(t('settings.objects.fields.errors.relation'));
      return;
    }
    await onSubmit({
      apiName,
      label: label.trim(),
      type,
      required,
      isUnique,
      isIndexed,
      options: buildOptions(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingField
              ? t('settings.objects.fields.editTitle')
              : t('settings.objects.fields.createTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="field-api-name">{t('settings.objects.fields.apiName')}</Label>
            <Input
              id="field-api-name"
              value={apiName}
              disabled={Boolean(editingField)}
              onChange={(event) => setApiName(event.target.value)}
              placeholder="e.g. company_size"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="field-label">{t('settings.objects.fields.label')}</Label>
            <Input
              id="field-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="field-type">{t('settings.objects.fields.type')}</Label>
            <Select
              value={type}
              disabled={Boolean(editingField)}
              onValueChange={(next) => setType(next as FieldType)}
            >
              <SelectTrigger id="field-type" aria-label={t('settings.objects.fields.type')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`settings.objects.fields.types.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={required} onCheckedChange={(c) => setRequired(c === true)} />
              {t('settings.objects.fields.required')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isUnique} onCheckedChange={(c) => setIsUnique(c === true)} />
              {t('settings.objects.fields.unique')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isIndexed} onCheckedChange={(c) => setIsIndexed(c === true)} />
              {t('settings.objects.fields.indexed')}
            </label>
          </div>

          {type === 'select' || type === 'multi_select' ? (
            <div className="space-y-2">
              <Label>{t('settings.objects.fields.choices')}</Label>
              {choices.map((choice, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder={t('settings.objects.fields.choiceValue')}
                    value={choice.value}
                    onChange={(event) =>
                      setChoices((prev) =>
                        prev.map((c, i) => (i === index ? { ...c, value: event.target.value } : c)),
                      )
                    }
                  />
                  <Input
                    placeholder={t('settings.objects.fields.choiceLabel')}
                    value={choice.label}
                    onChange={(event) =>
                      setChoices((prev) =>
                        prev.map((c, i) => (i === index ? { ...c, label: event.target.value } : c)),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setChoices((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setChoices((prev) => [...prev, { value: '', label: '' }])}
              >
                <Plus className="size-4" />
                {t('settings.objects.fields.addChoice')}
              </Button>
            </div>
          ) : null}

          {type === 'relation' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t('settings.objects.fields.relatedObject')}</Label>
                <Select value={relatedObjectApiName} onValueChange={setRelatedObjectApiName}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {objects
                      .filter((o) => o.apiName !== currentObjectApiName)
                      .map((o) => (
                        <SelectItem key={o.apiName} value={o.apiName}>
                          {o.labelSingular}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('settings.objects.fields.cardinality')}</Label>
                <Select
                  value={cardinality}
                  onValueChange={(v) => setCardinality(v as 'one' | 'many')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one">
                      {t('settings.objects.fields.cardinalityOne')}
                    </SelectItem>
                    <SelectItem value="many">
                      {t('settings.objects.fields.cardinalityMany')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={isPending} onClick={() => void handleSubmit()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
