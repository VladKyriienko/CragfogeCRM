import {
  viewSchema,
  type CreateViewBody,
  type UpdateViewBody,
  type ViewDto,
} from '@cragfoge/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { recordsKeys } from './query-keys';

export function useCreateView(workspaceId: string | null, objectApiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateViewBody): Promise<ViewDto> =>
      viewSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/views`, {
          method: 'POST',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: recordsKeys.views(workspaceId, objectApiName),
      });
    },
  });
}

export function useUpdateView(workspaceId: string | null, objectApiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      viewId,
      body,
    }: {
      viewId: string;
      body: UpdateViewBody;
    }): Promise<ViewDto> =>
      viewSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/views/${viewId}`, {
          method: 'PATCH',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: recordsKeys.views(workspaceId, objectApiName),
      });
    },
  });
}

export function useDeleteView(workspaceId: string | null, objectApiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (viewId: string): Promise<void> => {
      await apiFetch<void>(`/objects/${objectApiName}/views/${viewId}`, {
        method: 'DELETE',
        workspaceId,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: recordsKeys.views(workspaceId, objectApiName),
      });
    },
  });
}
