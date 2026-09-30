import { viewSchema, type ViewDto } from '@cragfoge/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api';
import { recordsKeys } from './query-keys';

const listSchema = z.array(viewSchema);

export function useViews(workspaceId: string | null, objectApiName: string | null | undefined) {
  return useQuery({
    queryKey: recordsKeys.views(workspaceId, objectApiName ?? ''),
    enabled: Boolean(workspaceId && objectApiName),
    queryFn: async (): Promise<ViewDto[]> =>
      listSchema.parse(await apiFetch<unknown>(`/objects/${objectApiName}/views`, { workspaceId })),
  });
}
