import { objectDefinitionSchema } from '@cragfoge/shared';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { RecordsEmptyState } from '@/features/records/records-empty-state';
import { apiFetch } from '@/lib/api';
import { getStoredWorkspaceId } from '@/lib/workspace';

const listSchema = z.array(objectDefinitionSchema);

export const Route = createFileRoute('/_app/records/')({
  beforeLoad: async () => {
    const workspaceId = getStoredWorkspaceId();
    if (!workspaceId) return;

    let firstApiName: string | undefined;
    try {
      const objects = listSchema.parse(await apiFetch<unknown>('/objects', { workspaceId }));
      firstApiName = (objects.find((object) => !object.isSystem) ?? objects[0])?.apiName;
    } catch {
      return;
    }

    if (firstApiName) {
      throw redirect({ to: '/records/$objectApiName', params: { objectApiName: firstApiName } });
    }
  },
  component: RecordsIndexEmptyState,
});

function RecordsIndexEmptyState() {
  const { t } = useTranslation();
  return (
    <RecordsEmptyState
      title={t('records.noObjects.title')}
      description={t('records.noObjects.description')}
    />
  );
}
