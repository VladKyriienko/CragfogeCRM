import { recordSchema, type RecordDto } from '@cragfoge/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { recordsKeys } from './query-keys';

export function useRecord(
  workspaceId: string | null,
  objectApiName: string | null | undefined,
  recordId: string | null | undefined,
) {
  return useQuery({
    queryKey: recordsKeys.detail(workspaceId, objectApiName ?? '', recordId ?? ''),
    enabled: Boolean(workspaceId && objectApiName && recordId),
    queryFn: async (): Promise<RecordDto> =>
      recordSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/records/${recordId}`, { workspaceId }),
      ),
  });
}
