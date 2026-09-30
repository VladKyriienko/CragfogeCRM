import type { FilterGroup, RecordSort } from '@cragfoge/shared';
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { downloadApiFile } from '@/lib/download';
import { useCreateExportJob, useExportJobStatus } from './use-export-job';

type Props = {
  workspaceId: string | null;
  objectApiName: string;
  filter?: FilterGroup;
  sort?: RecordSort;
  columns: string[];
};

export function ExportButton({ workspaceId, objectApiName, filter, sort, columns }: Props) {
  const { t } = useTranslation();
  const [jobId, setJobId] = useState<string | null>(null);
  const createJob = useCreateExportJob(workspaceId, objectApiName);
  const job = useExportJobStatus(workspaceId, objectApiName, jobId);

  async function startExport() {
    const created = await createJob.mutateAsync({ filter, sort, columns });
    setJobId(created.id);
  }

  async function download() {
    if (!jobId) return;
    await downloadApiFile(
      `/objects/${objectApiName}/exports/${jobId}/download`,
      `${objectApiName}-export.csv`,
      workspaceId,
    );
  }

  const isWorking = job.data?.status === 'pending' || job.data?.status === 'processing';

  if (jobId && job.data?.status === 'completed') {
    return (
      <Button variant="outline" size="sm" onClick={() => void download()}>
        <Download className="size-4" />
        {t('records.export.download')}
      </Button>
    );
  }

  if (jobId && job.data?.status === 'failed') {
    return (
      <Button variant="outline" size="sm" onClick={() => void startExport()}>
        {t('records.export.retry')}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={createJob.isPending || isWorking}
      onClick={() => void startExport()}
    >
      {createJob.isPending || isWorking ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      {t('records.export.action')}
    </Button>
  );
}
