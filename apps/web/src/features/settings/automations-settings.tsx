import {
  automationSchema,
  objectDefinitionSchema,
  type AutomationDto,
  type AutomationTrigger,
  type ObjectDefinitionDto,
} from '@cragfoge/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';

const listSchema = z.array(automationSchema);
const objectsSchema = z.array(objectDefinitionSchema);

type AutomationsSettingsProps = {
  workspaceId: string | null;
};

export function AutomationsSettings({ workspaceId }: AutomationsSettingsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [objectId, setObjectId] = useState('');
  const [triggerType, setTriggerType] = useState<AutomationTrigger['type']>('stage_changed');
  const [triggerTo, setTriggerTo] = useState('won');
  const [taskSubject, setTaskSubject] = useState('Follow up on {{name}}');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const automations = useQuery({
    queryKey: ['automations', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listSchema.parse(await apiFetch<unknown>('/automations', { workspaceId })),
  });

  const objects = useQuery({
    queryKey: ['objects', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => objectsSchema.parse(await apiFetch<unknown>('/objects', { workspaceId })),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const trigger: AutomationTrigger =
        triggerType === 'stage_changed'
          ? { type: 'stage_changed', to: triggerTo || undefined }
          : triggerType === 'record_created'
            ? { type: 'record_created' }
            : triggerType === 'field_changed'
              ? { type: 'field_changed', field: 'stage', to: triggerTo || undefined }
              : { type: 'date_reached', field: 'close_date' };

      const actions = [
        { type: 'create_task' as const, subject: taskSubject },
        ...(webhookUrl ? [{ type: 'call_webhook' as const, url: webhookUrl }] : []),
      ];

      return apiFetch('/automations', {
        method: 'POST',
        workspaceId,
        body: JSON.stringify({
          objectId,
          name,
          trigger,
          actions,
          isActive: true,
        }),
      });
    },
    onSuccess: async () => {
      setName('');
      setWebhookUrl('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['automations', workspaceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (automation: AutomationDto) =>
      apiFetch(`/automations/${automation.id}`, {
        method: 'PATCH',
        workspaceId,
        body: JSON.stringify({ isActive: !automation.isActive }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['automations', workspaceId] });
    },
  });

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <ul className="divide-y rounded-md border">
        {(automations.data ?? []).map((automation: AutomationDto) => (
          <li key={automation.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{automation.name}</div>
              <div className="text-muted-foreground">
                {(automation.trigger as AutomationTrigger).type}
                {' · '}
                {automation.isActive
                  ? t('settings.automations.active')
                  : t('settings.automations.inactive')}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleMutation.mutate(automation)}
              disabled={toggleMutation.isPending}
            >
              {automation.isActive
                ? t('settings.automations.disable')
                : t('settings.automations.enable')}
            </Button>
          </li>
        ))}
      </ul>

      <form
        className="space-y-3 rounded-md border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || !objectId || !taskSubject.trim()) return;
          createMutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="auto-name">{t('settings.automations.name')}</Label>
          <Input id="auto-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="auto-object">{t('settings.automations.object')}</Label>
          <select
            id="auto-object"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={objectId}
            onChange={(e) => setObjectId(e.target.value)}
          >
            <option value="">{t('settings.automations.chooseObject')}</option>
            {(objects.data ?? []).map((object: ObjectDefinitionDto) => (
              <option key={object.id} value={object.id}>
                {object.labelPlural}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="auto-trigger">{t('settings.automations.trigger')}</Label>
            <select
              id="auto-trigger"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as AutomationTrigger['type'])}
            >
              <option value="stage_changed">
                {t('settings.automations.triggers.stageChanged')}
              </option>
              <option value="record_created">
                {t('settings.automations.triggers.recordCreated')}
              </option>
              <option value="field_changed">
                {t('settings.automations.triggers.fieldChanged')}
              </option>
              <option value="date_reached">{t('settings.automations.triggers.dateReached')}</option>
            </select>
          </div>
          {(triggerType === 'stage_changed' || triggerType === 'field_changed') && (
            <div className="space-y-1.5">
              <Label htmlFor="auto-to">{t('settings.automations.triggerTo')}</Label>
              <Input
                id="auto-to"
                value={triggerTo}
                onChange={(e) => setTriggerTo(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="auto-task">{t('settings.automations.taskSubject')}</Label>
          <Input
            id="auto-task"
            value={taskSubject}
            onChange={(e) => setTaskSubject(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="auto-webhook">{t('settings.automations.webhookUrl')}</Label>
          <Input
            id="auto-webhook"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <Button type="submit" disabled={createMutation.isPending}>
          {t('settings.automations.create')}
        </Button>
      </form>
    </div>
  );
}
