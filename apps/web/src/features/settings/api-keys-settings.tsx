import {
  apiKeySchema,
  createdApiKeySchema,
  objectDefinitionSchema,
  type ApiKeyDto,
  type ObjectDefinitionDto,
} from '@cragfoge/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';

const listSchema = z.array(apiKeySchema);
const objectsSchema = z.array(objectDefinitionSchema);

type ApiKeysSettingsProps = {
  workspaceId: string | null;
};

export function ApiKeysSettings({ workspaceId }: ApiKeysSettingsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Record<string, Array<'read' | 'write'>>>({});
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keys = useQuery({
    queryKey: ['api-keys', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listSchema.parse(await apiFetch<unknown>('/api-keys', { workspaceId })),
  });

  const objects = useQuery({
    queryKey: ['objects', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () =>
      objectsSchema.parse(await apiFetch<unknown>('/objects', { workspaceId })),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = { name, scopes };
      const result = await apiFetch<unknown>('/api-keys', {
        method: 'POST',
        workspaceId,
        body: JSON.stringify(body),
      });
      return createdApiKeySchema.parse(result);
    },
    onSuccess: async (created) => {
      setRawKey(created.rawKey);
      setName('');
      setScopes({});
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api-keys/${id}`, { method: 'DELETE', workspaceId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const objectList = useMemo(() => objects.data ?? [], [objects.data]);

  function toggleScope(apiName: string, action: 'read' | 'write') {
    setScopes((current) => {
      const existing = new Set(current[apiName] ?? []);
      if (existing.has(action)) {
        existing.delete(action);
      } else {
        existing.add(action);
        if (action === 'write') existing.add('read');
      }
      const next = { ...current };
      if (existing.size === 0) {
        delete next[apiName];
      } else {
        next[apiName] = Array.from(existing) as Array<'read' | 'write'>;
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {rawKey ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium">{t('settings.apiKeys.rawKeyOnce')}</p>
          <code className="mt-1 block break-all">{rawKey}</code>
          <Button className="mt-2" variant="outline" size="sm" onClick={() => setRawKey(null)}>
            {t('settings.apiKeys.dismissRawKey')}
          </Button>
        </div>
      ) : null}

      <ul className="divide-y rounded-md border">
        {(keys.data ?? []).map((key: ApiKeyDto) => (
          <li key={key.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{key.name}</div>
              <div className="text-muted-foreground">
                {t('settings.apiKeys.prefix', { prefix: key.keyPrefix })}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!window.confirm(t('settings.apiKeys.confirmRevoke', { name: key.name }))) {
                  return;
                }
                revokeMutation.mutate(key.id);
              }}
              disabled={revokeMutation.isPending}
            >
              {t('settings.apiKeys.revoke')}
            </Button>
          </li>
        ))}
      </ul>

      <form
        className="space-y-3 rounded-md border p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim() || Object.keys(scopes).length === 0) return;
          createMutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="api-key-name">{t('settings.apiKeys.name')}</Label>
          <Input id="api-key-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('settings.apiKeys.scopes')}</Label>
          <div className="space-y-2">
            {objectList.map((object: ObjectDefinitionDto) => (
              <div key={object.id} className="flex items-center gap-4 text-sm">
                <span className="w-32 truncate">{object.labelPlural}</span>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={(scopes[object.apiName] ?? []).includes('read')}
                    onChange={() => toggleScope(object.apiName, 'read')}
                  />
                  {t('settings.apiKeys.read')}
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={(scopes[object.apiName] ?? []).includes('write')}
                    onChange={() => toggleScope(object.apiName, 'write')}
                  />
                  {t('settings.apiKeys.write')}
                </label>
              </div>
            ))}
          </div>
        </div>
        <Button type="submit" disabled={createMutation.isPending}>
          {t('settings.apiKeys.create')}
        </Button>
      </form>
    </div>
  );
}
