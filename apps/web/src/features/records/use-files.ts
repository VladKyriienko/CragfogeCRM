import { fileSchema, listFilesResponseSchema, type FileDto } from '@cragfoge/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { recordsKeys } from './query-keys';

export function useFiles(
  workspaceId: string | null,
  objectApiName: string,
  recordId: string | null | undefined,
) {
  return useQuery({
    queryKey: recordsKeys.files(workspaceId, objectApiName, recordId ?? ''),
    enabled: Boolean(workspaceId && recordId),
    queryFn: async (): Promise<FileDto[]> =>
      listFilesResponseSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/records/${recordId}/files`, {
          workspaceId,
        }),
      ).items,
  });
}

export function useUploadFile(workspaceId: string | null, objectApiName: string, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; mimeType: string; data: string }): Promise<FileDto> =>
      fileSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/records/${recordId}/files`, {
          method: 'POST',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: recordsKeys.files(workspaceId, objectApiName, recordId),
      });
    },
  });
}

export function useDeleteFile(workspaceId: string | null, objectApiName: string, recordId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fileId: string): Promise<void> => {
      await apiFetch<void>(`/objects/${objectApiName}/records/${recordId}/files/${fileId}`, {
        method: 'DELETE',
        workspaceId,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: recordsKeys.files(workspaceId, objectApiName, recordId),
      });
    },
  });
}
