import {
  fieldDefinitionWithVisibilitySchema,
  type FieldDefinitionWithVisibilityDto,
} from '@cragfoge/shared';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiFetch } from '@/lib/api';
import { metadataKeys } from './query-keys';

const listSchema = z.array(fieldDefinitionWithVisibilitySchema);

export function useFields(workspaceId: string | null, objectApiName: string | null | undefined) {
  return useQuery({
    queryKey: metadataKeys.fields(workspaceId, objectApiName ?? ''),
    enabled: Boolean(workspaceId && objectApiName),
    queryFn: async (): Promise<FieldDefinitionWithVisibilityDto[]> =>
      listSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/fields`, { workspaceId }),
      ),
  });
}
