import { objectDefinitionSchema, type ObjectDefinitionDto } from '@cragfoge/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api';
import { metadataKeys } from './query-keys';

const listSchema = z.array(objectDefinitionSchema);

export function useObjects(workspaceId: string | null) {
  return useQuery({
    queryKey: metadataKeys.objects(workspaceId),
    enabled: Boolean(workspaceId),
    queryFn: async (): Promise<ObjectDefinitionDto[]> =>
      listSchema.parse(await apiFetch<unknown>('/objects', { workspaceId })),
  });
}
