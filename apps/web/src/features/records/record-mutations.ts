import {
  bulkOperationResultSchema,
  recordSchema,
  type BulkOperationResult,
  type BulkUpdateBody,
  type CreateRecordBody,
  type RecordDto,
  type UpdateRecordBody,
} from '@cragfoge/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { recordsKeys } from './query-keys';

export function useCreateRecord(workspaceId: string | null, objectApiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateRecordBody): Promise<RecordDto> =>
      recordSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/records`, {
          method: 'POST',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: recordsKeys.listPrefix(workspaceId, objectApiName),
      });
    },
  });
}

export function useUpdateRecord(workspaceId: string | null, objectApiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: UpdateRecordBody }): Promise<RecordDto> =>
      recordSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/records/${id}`, {
          method: 'PATCH',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: recordsKeys.listPrefix(workspaceId, objectApiName),
      });
      await queryClient.invalidateQueries({
        queryKey: recordsKeys.detail(workspaceId, objectApiName, variables.id),
      });
    },
  });
}

export function useDeleteRecord(workspaceId: string | null, objectApiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      await apiFetch<void>(`/objects/${objectApiName}/records/${id}`, {
        method: 'DELETE',
        workspaceId,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: recordsKeys.listPrefix(workspaceId, objectApiName),
      });
    },
  });
}

export function useBulkUpdateRecords(workspaceId: string | null, objectApiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: BulkUpdateBody): Promise<BulkOperationResult> =>
      bulkOperationResultSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/records/bulk-update`, {
          method: 'POST',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: recordsKeys.listPrefix(workspaceId, objectApiName),
      });
    },
  });
}

export function useBulkDeleteRecords(workspaceId: string | null, objectApiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]): Promise<BulkOperationResult> =>
      bulkOperationResultSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/records/bulk-delete`, {
          method: 'POST',
          workspaceId,
          body: JSON.stringify({ ids }),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: recordsKeys.listPrefix(workspaceId, objectApiName),
      });
    },
  });
}
