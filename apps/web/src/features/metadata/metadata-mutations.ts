import {
  objectDefinitionSchema,
  fieldDefinitionSchema,
  type CreateFieldBody,
  type CreateObjectBody,
  type FieldDefinitionDto,
  type ObjectDefinitionDto,
  type UpdateFieldBody,
  type UpdateObjectBody,
} from '@cragfoge/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { metadataKeys } from './query-keys';

export function useCreateObject(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateObjectBody): Promise<ObjectDefinitionDto> =>
      objectDefinitionSchema.parse(
        await apiFetch<unknown>('/objects', {
          method: 'POST',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: metadataKeys.objects(workspaceId) });
    },
  });
}

export function useUpdateObject(workspaceId: string | null, apiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateObjectBody): Promise<ObjectDefinitionDto> =>
      objectDefinitionSchema.parse(
        await apiFetch<unknown>(`/objects/${apiName}`, {
          method: 'PATCH',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: metadataKeys.objects(workspaceId) });
    },
  });
}

export function useDeleteObject(workspaceId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (apiName: string): Promise<void> => {
      await apiFetch<void>(`/objects/${apiName}`, { method: 'DELETE', workspaceId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: metadataKeys.objects(workspaceId) });
    },
  });
}

export function useCreateField(workspaceId: string | null, objectApiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateFieldBody): Promise<FieldDefinitionDto> =>
      fieldDefinitionSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/fields`, {
          method: 'POST',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: metadataKeys.fields(workspaceId, objectApiName),
      });
      await queryClient.invalidateQueries({ queryKey: metadataKeys.objects(workspaceId) });
    },
  });
}

export function useUpdateField(workspaceId: string | null, objectApiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      fieldApiName,
      body,
    }: {
      fieldApiName: string;
      body: UpdateFieldBody;
    }): Promise<FieldDefinitionDto> =>
      fieldDefinitionSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/fields/${fieldApiName}`, {
          method: 'PATCH',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: metadataKeys.fields(workspaceId, objectApiName),
      });
    },
  });
}

export function useDeleteField(workspaceId: string | null, objectApiName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fieldApiName: string): Promise<void> => {
      await apiFetch<void>(`/objects/${objectApiName}/fields/${fieldApiName}`, {
        method: 'DELETE',
        workspaceId,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: metadataKeys.fields(workspaceId, objectApiName),
      });
    },
  });
}
