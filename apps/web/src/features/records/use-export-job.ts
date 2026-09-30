import { exportJobSchema, type CreateExportJobBody, type ExportJobDto } from '@cragfoge/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { recordsKeys } from './query-keys';

export function useCreateExportJob(workspaceId: string | null, objectApiName: string) {
  return useMutation({
    mutationFn: async (body: CreateExportJobBody): Promise<ExportJobDto> =>
      exportJobSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/exports`, {
          method: 'POST',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
  });
}

export function useExportJobStatus(
  workspaceId: string | null,
  objectApiName: string,
  jobId: string | null,
) {
  return useQuery({
    queryKey: recordsKeys.exportJob(workspaceId, objectApiName, jobId ?? ''),
    enabled: Boolean(workspaceId && jobId),
    queryFn: async (): Promise<ExportJobDto> =>
      exportJobSchema.parse(
        await apiFetch<unknown>(`/objects/${objectApiName}/exports/${jobId}`, { workspaceId }),
      ),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'completed' || status === 'failed' ? false : 1000;
    },
  });
}
