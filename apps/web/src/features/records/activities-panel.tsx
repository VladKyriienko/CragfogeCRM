import { activitySchema, type ActivityDto } from '@cragfoge/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';

const listSchema = z.array(activitySchema);

type ActivitiesPanelProps = {
  workspaceId: string | null;
  objectApiName: string;
  recordId: string;
};

export function ActivitiesPanel({ workspaceId, objectApiName, recordId }: ActivitiesPanelProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');

  const activities = useQuery({
    queryKey: ['activities', workspaceId, objectApiName, recordId],
    enabled: Boolean(workspaceId),
    queryFn: async () =>
      listSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/records/${recordId}/activities`, {
          workspaceId,
        }),
      ),
  });

  const createMutation = useMutation({
    mutationFn: async () =>
      apiFetch(`/objects/${objectApiName}/records/${recordId}/activities`, {
        method: 'POST',
        workspaceId,
        body: JSON.stringify({ type: 'task', subject }),
      }),
    onSuccess: async () => {
      setSubject('');
      await queryClient.invalidateQueries({
        queryKey: ['activities', workspaceId, objectApiName, recordId],
      });
    },
  });

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          if (!subject.trim()) return;
          createMutation.mutate();
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="task-subject">{t('records.detail.activities.subject')}</Label>
          <Input
            id="task-subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={t('records.detail.activities.subjectPlaceholder')}
          />
        </div>
        <Button type="submit" disabled={createMutation.isPending || !subject.trim()}>
          {t('records.detail.activities.addTask')}
        </Button>
      </form>

      {activities.isPending ? (
        <p className="text-sm text-muted-foreground">{t('records.detail.activities.loading')}</p>
      ) : null}
      {activities.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('records.detail.activities.empty')}</p>
      ) : null}
      <ul className="divide-y rounded-md border">
        {(activities.data ?? []).map((activity: ActivityDto) => (
          <li key={activity.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <span>{activity.subject}</span>
            <span className="text-muted-foreground">{activity.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
