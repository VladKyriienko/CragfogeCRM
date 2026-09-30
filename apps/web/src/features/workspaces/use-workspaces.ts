import { workspaceSchema, type WorkspaceDto } from '@cragfoge/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api';
import { getStoredWorkspaceId, setStoredWorkspaceId } from '@/lib/workspace';

const listSchema = z.array(workspaceSchema);

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    staleTime: 60_000,
    queryFn: async (): Promise<{ workspaces: WorkspaceDto[]; currentId: string | null }> => {
      const workspaces = listSchema.parse(await apiFetch<unknown>('/workspaces'));
      const stored = getStoredWorkspaceId();
      const currentId =
        (stored && workspaces.some((workspace) => workspace.id === stored) ? stored : null) ??
        workspaces[0]?.id ??
        null;
      if (currentId && currentId !== stored) {
        setStoredWorkspaceId(currentId);
      }
      return { workspaces, currentId };
    },
  });
}
