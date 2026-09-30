import type { FieldDefinitionWithVisibilityDto } from '@cragfoge/shared';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFields } from '@/features/metadata/use-fields';
import { useObjects } from '@/features/metadata/use-objects';
import { useWorkspaceMembers } from '@/features/workspaces/use-workspace-members';
import { getStoredWorkspaceId } from '@/lib/workspace';
import { ActivitiesPanel } from './activities-panel';
import { FilesPanel } from './files-panel';
import { RecordFieldInput } from './record-field-input';
import { useRecord } from './use-record';
import { useUpdateRecord } from './record-mutations';
import { RelatedRecordsField } from './related-records';

export function RecordDetailPage() {
  const { t } = useTranslation();
  const { objectApiName, recordId } = useParams({
    from: '/_app/records/$objectApiName/$recordId',
  });
  const workspaceId = getStoredWorkspaceId();
  const objects = useObjects(workspaceId);
  const fields = useFields(workspaceId, objectApiName);
  const members = useWorkspaceMembers(workspaceId);
  const record = useRecord(workspaceId, objectApiName, recordId);
  const updateRecord = useUpdateRecord(workspaceId, objectApiName);

  const objectDef = objects.data?.find((item) => item.apiName === objectApiName);

  const [nameDraft, setNameDraft] = useState('');
  useEffect(() => {
    if (record.data) setNameDraft(record.data.name);
  }, [record.data]);

  if (record.isPending || fields.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (record.isError || !record.data) {
    return <p className="text-sm text-destructive">{t('records.detail.notFound')}</p>;
  }

  const visibleFields = (fields.data ?? []).filter((field) => field.deletedAt === null);
  const dataFields = visibleFields.filter((field) => field.type !== 'relation');
  const relationFields = visibleFields.filter((field) => field.type === 'relation');
  const currentRecord = record.data;

  function saveField(field: FieldDefinitionWithVisibilityDto, value: unknown) {
    if (field.visibility !== 'write') return;
    updateRecord.mutate({ id: recordId, body: { data: { [field.apiName]: value } } });
  }

  return (
    <div className="space-y-6">
      <Link
        to="/records/$objectApiName"
        params={{ objectApiName }}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {objectDef?.labelPlural ?? objectApiName}
      </Link>

      <header className="space-y-3">
        <Input
          className="max-w-lg text-xl font-semibold"
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={() => {
            if (nameDraft && nameDraft !== currentRecord.name) {
              updateRecord.mutate({ id: recordId, body: { name: nameDraft } });
            }
          }}
        />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t('records.detail.owner')}:</span>
          <Select
            value={currentRecord.ownerId}
            onValueChange={(next) => updateRecord.mutate({ id: recordId, body: { ownerId: next } })}
          >
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(members.data ?? []).map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">{t('records.detail.tabs.details')}</TabsTrigger>
          <TabsTrigger value="files">{t('records.detail.tabs.files')}</TabsTrigger>
          <TabsTrigger value="activity">{t('records.detail.tabs.activity')}</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            {dataFields.map((field) => (
              <div key={field.apiName} className="space-y-1.5">
                <Label>{field.label}</Label>
                <RecordFieldInput
                  workspaceId={workspaceId}
                  field={field}
                  value={currentRecord.data[field.apiName] ?? null}
                  onChange={(value) => saveField(field, value)}
                  disabled={field.visibility !== 'write'}
                />
              </div>
            ))}
          </section>

          {relationFields.length > 0 ? (
            <section className="space-y-4">
              <h3 className="text-sm font-medium">{t('records.detail.related')}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {relationFields.map((field) => (
                  <div key={field.apiName} className="space-y-1.5">
                    <Label>{field.label}</Label>
                    <RelatedRecordsField
                      workspaceId={workspaceId}
                      field={field}
                      record={currentRecord}
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="files">
          <FilesPanel workspaceId={workspaceId} objectApiName={objectApiName} recordId={recordId} />
        </TabsContent>

        <TabsContent value="activity">
          <ActivitiesPanel
            workspaceId={workspaceId}
            objectApiName={objectApiName}
            recordId={recordId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
