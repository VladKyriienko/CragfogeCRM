import {
  createdWebhookSchema,
  objectDefinitionSchema,
  webhookDeliverySchema,
  webhookEventSchema,
  webhookSubscriptionSchema,
  type WebhookDeliveryDto,
  type WebhookEvent,
  type WebhookSubscriptionDto,
} from '@cragfoge/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';

const listSchema = z.array(webhookSubscriptionSchema);
const deliveriesSchema = z.array(webhookDeliverySchema);
const objectsSchema = z.array(objectDefinitionSchema);
const ALL_EVENTS = webhookEventSchema.options;

type WebhooksSettingsProps = {
  workspaceId: string | null;
};

export function WebhooksSettings({ workspaceId }: WebhooksSettingsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['record.created']);
  const [objectId, setObjectId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [signingSecret, setSigningSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hooks = useQuery({
    queryKey: ['webhooks', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listSchema.parse(await apiFetch<unknown>('/webhooks', { workspaceId })),
  });

  const objects = useQuery({
    queryKey: ['objects', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () =>
      objectsSchema.parse(await apiFetch<unknown>('/objects', { workspaceId })),
  });

  const deliveries = useQuery({
    queryKey: ['webhook-deliveries', workspaceId, selectedId],
    enabled: Boolean(workspaceId && selectedId),
    queryFn: async () =>
      deliveriesSchema.parse(
        await apiFetch<unknown>(`/webhooks/${selectedId}/deliveries`, { workspaceId }),
      ),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const result = await apiFetch<unknown>('/webhooks', {
        method: 'POST',
        workspaceId,
        body: JSON.stringify({
          url,
          events,
          objectId: objectId || null,
        }),
      });
      return createdWebhookSchema.parse(result);
    },
    onSuccess: async (created) => {
      setSigningSecret(created.signingSecret);
      setUrl('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['webhooks', workspaceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const resendMutation = useMutation({
    mutationFn: (deliveryId: string) =>
      apiFetch(`/webhooks/${selectedId}/deliveries/${deliveryId}/resend`, {
        method: 'POST',
        workspaceId,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['webhook-deliveries', workspaceId, selectedId],
      });
    },
  });

  function toggleEvent(event: WebhookEvent) {
    setEvents((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event],
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {signingSecret ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium">{t('settings.webhooks.secretOnce')}</p>
          <code className="mt-1 block break-all">{signingSecret}</code>
          <Button className="mt-2" variant="outline" size="sm" onClick={() => setSigningSecret(null)}>
            {t('settings.webhooks.dismissSecret')}
          </Button>
        </div>
      ) : null}

      <ul className="divide-y rounded-md border">
        {(hooks.data ?? []).map((hook: WebhookSubscriptionDto) => (
          <li key={hook.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <button
              type="button"
              className="text-left"
              onClick={() => setSelectedId(hook.id)}
            >
              <div className="font-medium truncate max-w-md">{hook.url}</div>
              <div className="text-muted-foreground">
                {hook.isActive
                  ? t('settings.webhooks.active')
                  : t('settings.webhooks.disabled')}
                {' · '}
                {hook.events.join(', ')}
              </div>
            </button>
            <Button variant="outline" size="sm" onClick={() => setSelectedId(hook.id)}>
              {t('settings.webhooks.deliveries')}
            </Button>
          </li>
        ))}
      </ul>

      {selectedId ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t('settings.webhooks.deliveryLog')}</h3>
          <ul className="divide-y rounded-md border">
            {(deliveries.data ?? []).map((delivery: WebhookDeliveryDto) => (
              <li key={delivery.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div>
                    {delivery.event} · {delivery.status}
                    {delivery.responseStatus != null ? ` · HTTP ${delivery.responseStatus}` : ''}
                  </div>
                  <div className="text-muted-foreground">
                    {t('settings.webhooks.attempts', { count: delivery.attemptCount })}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resendMutation.mutate(delivery.id)}
                  disabled={resendMutation.isPending}
                >
                  {t('settings.webhooks.resend')}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        className="space-y-3 rounded-md border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!url.trim() || events.length === 0) return;
          createMutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="webhook-url">{t('settings.webhooks.url')}</Label>
          <Input id="webhook-url" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="webhook-object">{t('settings.webhooks.objectFilter')}</Label>
          <select
            id="webhook-object"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={objectId}
            onChange={(e) => setObjectId(e.target.value)}
          >
            <option value="">{t('settings.webhooks.allObjects')}</option>
            {(objects.data ?? []).map((object) => (
              <option key={object.id} value={object.id}>
                {object.labelPlural}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>{t('settings.webhooks.events')}</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_EVENTS.map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={events.includes(event)}
                  onChange={() => toggleEvent(event)}
                />
                {event}
              </label>
            ))}
          </div>
        </div>
        <Button type="submit" disabled={createMutation.isPending}>
          {t('settings.webhooks.create')}
        </Button>
      </form>
    </div>
  );
}
