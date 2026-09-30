import { globalSearchResponseSchema, type GlobalSearchResult } from '@cragfoge/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function useGlobalSearch(workspaceId: string | null, query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['global-search', workspaceId, trimmed],
    enabled: Boolean(workspaceId && trimmed.length > 0),
    queryFn: async (): Promise<GlobalSearchResult[]> =>
      globalSearchResponseSchema.parse(
        await apiFetch<unknown>(`/search?q=${encodeURIComponent(trimmed)}`, { workspaceId }),
      ).items,
  });
}
