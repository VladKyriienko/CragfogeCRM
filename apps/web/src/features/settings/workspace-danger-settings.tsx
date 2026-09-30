import { workspaceSchema, type WorkspaceDto } from '@cragfoge/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

export function WorkspaceDangerSettings({ workspaceId }: { workspaceId: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const workspace = useQuery({
    queryKey: ['workspace', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () =>
      workspaceSchema.parse(await apiFetch<WorkspaceDto>(`/workspaces/${workspaceId}`)),
  });

  const schedule = useMutation({
    mutationFn: async () =>
      workspaceSchema.parse(
        await apiFetch(`/workspaces/${workspaceId}/delete`, { method: 'POST' }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
  });

  const cancel = useMutation({
    mutationFn: async () =>
      workspaceSchema.parse(
        await apiFetch(`/workspaces/${workspaceId}/cancel-deletion`, { method: 'POST' }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
  });

  if (!workspaceId) {
    return null;
  }

  const scheduledAt = workspace.data?.deletionScheduledAt;

  return (
    <div className="space-y-4 rounded-md border border-destructive/40 p-4">
      <div>
        <h2 className="text-sm font-medium text-destructive">{t('settings.danger.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('settings.danger.description')}</p>
      </div>
      {scheduledAt ? (
        <>
          <p className="text-sm">
            {t('settings.danger.scheduled', { date: new Date(scheduledAt).toLocaleString() })}
          </p>
          <Button variant="outline" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            {t('settings.danger.cancel')}
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          className="border-destructive text-destructive"
          onClick={() => {
            if (window.confirm(t('settings.danger.confirm'))) {
              schedule.mutate();
            }
          }}
          disabled={schedule.isPending}
        >
          {t('settings.danger.delete')}
        </Button>
      )}
    </div>
  );
}
