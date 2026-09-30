import { memberPickerItemSchema, type MemberPickerItem } from '@cragfoge/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api';

const listSchema = z.array(memberPickerItemSchema);

export function useWorkspaceMembers(workspaceId: string | null) {
  return useQuery({
    queryKey: ['workspace-members', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<MemberPickerItem[]> =>
      listSchema.parse(await apiFetch<unknown>('/workspace/members', { workspaceId })),
  });
}
