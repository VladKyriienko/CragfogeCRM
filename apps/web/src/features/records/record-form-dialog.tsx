import { zodResolver } from '@hookform/resolvers/zod';
import {
  buildRecordSchema,
  type CreateRecordBody,
  type FieldDefinitionWithVisibilityDto,
} from '@cragfoge/shared';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RecordFieldInput } from './record-field-input';
import { RelationFieldInput } from './relation-field-input';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  fields: FieldDefinitionWithVisibilityDto[];
  onSubmit: (body: CreateRecordBody) => Promise<void> | void;
  isPending: boolean;
};

function defaultDataValue(field: FieldDefinitionWithVisibilityDto): unknown {
  switch (field.type) {
    case 'boolean':
      return false;
    case 'multi_select':
      return [];
    case 'currency':
      return { amount: 0, currency: 'USD' };
    default:
      return field.required ? '' : null;
  }
}

export function RecordFormDialog({
  open,
  onOpenChange,
  workspaceId,
  fields,
  onSubmit,
  isPending,
}: Props) {
  const { t } = useTranslation();
  const writableFields = useMemo(
    () => fields.filter((field) => field.visibility === 'write' && field.type !== 'relation'),
    [fields],
  );
  const relationFields = useMemo(
    () => fields.filter((field) => field.visibility === 'write' && field.type === 'relation'),
    [fields],
  );

  const dataSchema = useMemo(() => buildRecordSchema(writableFields), [writableFields]);
  const formSchema = useMemo(
    () => z.object({ name: z.string().min(1).max(500), data: dataSchema }),
    [dataSchema],
  );
  type FormValues = z.infer<typeof formSchema>;

  const defaultData = useMemo(() => {
    const result: Record<string, unknown> = {};
    for (const field of writableFields) {
      result[field.apiName] = defaultDataValue(field);
    }
    return result;
  }, [writableFields]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', data: defaultData } as FormValues,
  });

  const [relations, setRelations] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (open) {
      form.reset({ name: '', data: defaultData } as FormValues);
      setRelations({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleSubmit(values: FormValues) {
    const relationsPayload: Record<string, string | string[]> = {};
    for (const field of relationFields) {
      const ids = relations[field.apiName] ?? [];
      if (ids.length === 0) continue;
      relationsPayload[field.apiName] = field.options.cardinality === 'many' ? ids : ids[0]!;
    }
    await onSubmit({
      name: values.name,
      data: values.data,
      relations: Object.keys(relationsPayload).length > 0 ? relationsPayload : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('records.create.title')}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit(handleSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="record-name">{t('records.field.name')}</Label>
            <Input id="record-name" {...form.register('name')} />
            {form.formState.errors.name ? (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          {writableFields.map((field) => (
            <div key={field.apiName} className="space-y-2">
              <Label htmlFor={`record-field-${field.apiName}`}>
                {field.label}
                {field.required ? ' *' : ''}
              </Label>
              <Controller
                control={form.control}
                name={`data.${field.apiName}` as const}
                render={({ field: controllerField }) => (
                  <RecordFieldInput
                    id={`record-field-${field.apiName}`}
                    workspaceId={workspaceId}
                    field={field}
                    value={controllerField.value}
                    onChange={controllerField.onChange}
                  />
                )}
              />
            </div>
          ))}

          {relationFields.map((field) => (
            <div key={field.apiName} className="space-y-2">
              <Label>{field.label}</Label>
              <RelationFieldInput
                workspaceId={workspaceId}
                field={field}
                value={relations[field.apiName] ?? []}
                onChange={(ids) => setRelations((prev) => ({ ...prev, [field.apiName]: ids }))}
              />
            </div>
          ))}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isPending}>
              {t('records.create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
