import { MAX_FILE_SIZE_BYTES } from '@cragfoge/shared';
import { Paperclip, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { readFileAsBase64 } from '@/lib/download';
import { useDeleteFile, useFiles, useUploadFile } from './use-files';

type Props = {
  workspaceId: string | null;
  objectApiName: string;
  recordId: string;
};

export function FilesPanel({ workspaceId, objectApiName, recordId }: Props) {
  const { t } = useTranslation();
  const files = useFiles(workspaceId, objectApiName, recordId);
  const upload = useUploadFile(workspaceId, objectApiName, recordId);
  const remove = useDeleteFile(workspaceId, objectApiName, recordId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(t('records.files.tooLarge'));
      return;
    }
    try {
      const data = await readFileAsBase64(file);
      await upload.mutateAsync({
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        data,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.errors.generic'));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('records.files.title')}</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
        >
          <Upload className="size-4" />
          {t('records.files.upload')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => void handleFileSelected(event.target.files)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {files.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : null}
      {files.data && files.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('records.files.empty')}</p>
      ) : null}
      {files.data && files.data.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {files.data.map((file) => (
            <li key={file.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Paperclip className="size-4 text-muted-foreground" />
                {file.name}
                <span className="text-muted-foreground">
                  ({Math.max(1, Math.round(file.sizeBytes / 1024))} KB)
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (!window.confirm(t('records.files.confirmDelete', { name: file.name }))) {
                    return;
                  }
                  remove.mutate(file.id);
                }}
                disabled={remove.isPending}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
