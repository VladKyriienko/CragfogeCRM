import type { CreateFieldBody, FieldDefinitionWithVisibilityDto } from '@cragfoge/shared';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useFields } from '@/features/metadata/use-fields';
import {
  useCreateField,
  useCreateObject,
  useDeleteField,
  useUpdateField,
} from '@/features/metadata/metadata-mutations';
import { useObjects } from '@/features/metadata/use-objects';
import { FieldFormDialog } from './field-form-dialog';

export function ObjectsSettings({ workspaceId }: { workspaceId: string | null }) {
  const { t } = useTranslation();
  const objects = useObjects(workspaceId);
  const [selectedApiName, setSelectedApiName] = useState<string | null>(null);
  const activeApiName = selectedApiName ?? objects.data?.[0]?.apiName ?? null;
  const fields = useFields(workspaceId, activeApiName);

  const [createObjectOpen, setCreateObjectOpen] = useState(false);
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinitionWithVisibilityDto | null>(null);

  const createObject = useCreateObject(workspaceId);
  const createField = useCreateField(workspaceId, activeApiName ?? '');
  const updateField = useUpdateField(workspaceId, activeApiName ?? '');
  const deleteField = useDeleteField(workspaceId, activeApiName ?? '');

  const sortedFields = [...(fields.data ?? [])].sort((a, b) => a.position - b.position);

  async function handleFieldSubmit(body: CreateFieldBody) {
    if (editingField) {
      await updateField.mutateAsync({
        fieldApiName: editingField.apiName,
        body: {
          label: body.label,
          required: body.required,
          isUnique: body.isUnique,
          isIndexed: body.isIndexed,
          options: body.options,
        },
      });
    } else {
      await createField.mutateAsync(body);
    }
    setFieldDialogOpen(false);
    setEditingField(null);
  }

  function move(field: FieldDefinitionWithVisibilityDto, direction: -1 | 1) {
    const index = sortedFields.findIndex((f) => f.apiName === field.apiName);
    const targetIndex = index + direction;
    const target = sortedFields[targetIndex];
    if (!target) return;
    updateField.mutate({ fieldApiName: field.apiName, body: { position: target.position } });
    updateField.mutate({ fieldApiName: target.apiName, body: { position: field.position } });
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[220px_1fr]">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">{t('settings.objects.title')}</h3>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('settings.objects.createTitle')}
            onClick={() => setCreateObjectOpen(true)}
          >
            <Plus className="size-4" />
          </Button>
        </div>
        {objects.isPending ? <Skeleton className="h-24 w-full" /> : null}
        <ul className="space-y-1">
          {(objects.data ?? []).map((object) => (
            <li key={object.id}>
              <button
                type="button"
                onClick={() => setSelectedApiName(object.apiName)}
                className={
                  object.apiName === activeApiName
                    ? 'block w-full rounded-md bg-accent px-3 py-2 text-left text-sm font-medium'
                    : 'block w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent/50'
                }
              >
                {object.labelPlural}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-4">
        {activeApiName ? (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">{t('settings.objects.fields.title')}</h3>
              <Button
                size="sm"
                onClick={() => {
                  setEditingField(null);
                  setFieldDialogOpen(true);
                }}
              >
                <Plus className="size-4" />
                {t('settings.objects.fields.add')}
              </Button>
            </div>
            {fields.isPending ? <Skeleton className="h-40 w-full" /> : null}
            <ul className="divide-y rounded-md border">
              {sortedFields.map((field) => (
                <li
                  key={field.apiName}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="size-4 text-muted-foreground" />
                    <span className="font-medium">{field.label}</span>
                    <span className="text-muted-foreground">{field.apiName}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{field.type}</span>
                    {field.isSystem ? (
                      <span className="text-xs text-muted-foreground">
                        {t('settings.objects.fields.system')}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => move(field, -1)}>
                      ↑
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => move(field, 1)}>
                      ↓
                    </Button>
                    {!field.isSystem ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingField(field);
                            setFieldDialogOpen(true);
                          }}
                        >
                          {t('common.edit')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (
                              !window.confirm(
                                t('settings.objects.fields.confirmDelete', { name: field.label }),
                              )
                            ) {
                              return;
                            }
                            deleteField.mutate(field.apiName);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('settings.objects.noSelection')}</p>
        )}
      </div>

      <FieldFormDialog
        open={fieldDialogOpen}
        onOpenChange={setFieldDialogOpen}
        objects={objects.data ?? []}
        currentObjectApiName={activeApiName ?? ''}
        editingField={editingField}
        isPending={createField.isPending || updateField.isPending}
        onSubmit={handleFieldSubmit}
      />

      <CreateObjectDialog
        open={createObjectOpen}
        onOpenChange={setCreateObjectOpen}
        isPending={createObject.isPending}
        onSubmit={async (body) => {
          const created = await createObject.mutateAsync(body);
          setSelectedApiName(created.apiName);
          setCreateObjectOpen(false);
        }}
      />
    </div>
  );
}

function CreateObjectDialog({
  open,
  onOpenChange,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSubmit: (body: {
    apiName: string;
    labelSingular: string;
    labelPlural: string;
    icon?: string;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [apiName, setApiName] = useState('');
  const [labelSingular, setLabelSingular] = useState('');
  const [labelPlural, setLabelPlural] = useState('');
  const [icon, setIcon] = useState('box');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!/^[a-z][a-z0-9_]*$/.test(apiName)) {
      setError(t('settings.objects.errors.apiName'));
      return;
    }
    if (!labelSingular.trim() || !labelPlural.trim()) {
      setError(t('settings.objects.errors.label'));
      return;
    }
    try {
      await onSubmit({
        apiName,
        labelSingular: labelSingular.trim(),
        labelPlural: labelPlural.trim(),
        icon,
      });
      setApiName('');
      setLabelSingular('');
      setLabelPlural('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.objects.createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-object-api-name">{t('settings.objects.apiName')}</Label>
            <Input
              id="new-object-api-name"
              value={apiName}
              onChange={(event) => setApiName(event.target.value)}
              placeholder="e.g. deals"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-object-label-singular">{t('settings.objects.labelSingular')}</Label>
            <Input
              id="new-object-label-singular"
              value={labelSingular}
              onChange={(event) => setLabelSingular(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-object-label-plural">{t('settings.objects.labelPlural')}</Label>
            <Input
              id="new-object-label-plural"
              value={labelPlural}
              onChange={(event) => setLabelPlural(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-object-icon">{t('settings.objects.icon')}</Label>
            <Select value={icon} onValueChange={setIcon}>
              <SelectTrigger id="new-object-icon" aria-label={t('settings.objects.icon')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  'box',
                  'briefcase',
                  'building',
                  'contact',
                  'handshake',
                  'tag',
                  'ticket',
                  'truck',
                  'users',
                ].map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
