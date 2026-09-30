import { entitlementsSchema, type EntitlementsDto } from '@cragfoge/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export function useEntitlements(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ['entitlements', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<EntitlementsDto> =>
      entitlementsSchema.parse(await apiFetch<unknown>('/billing/entitlements', { workspaceId })),
  });
}
