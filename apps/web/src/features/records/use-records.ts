import {
  listRecordsResponseSchema,
  type FilterGroup,
  type ListRecordsResponse,
  type RecordSort,
} from '@cragfoge/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { recordsKeys } from './query-keys';

export type RecordsListParams = {
  filter?: FilterGroup;
  sort?: RecordSort;
  q?: string;
  limit?: number;
};

function buildQuery(params: RecordsListParams, cursor?: string): string {
  const search = new URLSearchParams();
  if (params.filter) search.set('filter', JSON.stringify(params.filter));
  if (params.sort) search.set('sort', JSON.stringify(params.sort));
  if (params.q) search.set('q', params.q);
  search.set('limit', String(params.limit ?? 50));
  if (cursor) search.set('cursor', cursor);
  return search.toString();
}

export function useRecords(
  workspaceId: string | null,
  objectApiName: string | null | undefined,
  params: RecordsListParams,
) {
  return useInfiniteQuery({
    queryKey: recordsKeys.list(workspaceId, objectApiName ?? '', params),
    enabled: Boolean(workspaceId && objectApiName),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<ListRecordsResponse> =>
      listRecordsResponseSchema.parse(
        await apiFetch<unknown>(
          `/objects/${objectApiName}/records?${buildQuery(params, pageParam)}`,
          { workspaceId },
        ),
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
