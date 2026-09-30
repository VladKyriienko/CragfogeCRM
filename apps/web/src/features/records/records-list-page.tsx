import type { FilterCondition, RecordSort, ViewDto } from '@cragfoge/shared';
import { useParams } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useFields } from '@/features/metadata/use-fields';
import { useObjects } from '@/features/metadata/use-objects';
import { useWorkspaceMembers } from '@/features/workspaces/use-workspace-members';
import { getStoredWorkspaceId } from '@/lib/workspace';
import { BulkEditDialog } from './bulk-edit-dialog';
import { buildColumnDefs } from './record-cell';
import { ColumnPicker } from './column-picker';
import { ExportButton } from './export-button';
import { defaultColumns } from './field-utils';
import { FilterBuilder } from './filter-builder';
import { RecordFormDialog } from './record-form-dialog';
import {
  useBulkDeleteRecords,
  useBulkUpdateRecords,
  useCreateRecord,
  useUpdateRecord,
} from './record-mutations';
import { RecordTable } from './record-table';
import { RecordsEmptyState } from './records-empty-state';
import { SavedViewsBar } from './saved-views-bar';
import { SortControl } from './sort-control';
import { useRecords } from './use-records';
import { useViews } from './use-views';

const DEFAULT_SORT: RecordSort = { field: 'created_at', direction: 'desc' };

export function RecordsListPage() {
  const { t } = useTranslation();
  const { objectApiName } = useParams({ from: '/_app/records/$objectApiName/' });
  const workspaceId = getStoredWorkspaceId();

  const objects = useObjects(workspaceId);
  const fields = useFields(workspaceId, objectApiName);
  const members = useWorkspaceMembers(workspaceId);
  const views = useViews(workspaceId, objectApiName);

  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  const [sort, setSort] = useState<RecordSort>(DEFAULT_SORT);
  const [columns, setColumns] = useState<string[] | null>(null);
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);

  // Reset local view state whenever the object changes.
  useEffect(() => {
    setFilterConditions([]);
    setSort(DEFAULT_SORT);
    setColumns(null);
    setSelectedViewId(null);
    setSelectedIds(new Set());
    setSearch('');
  }, [objectApiName]);

  useEffect(() => {
    if (columns === null && fields.data) {
      setColumns(defaultColumns(fields.data));
    }
  }, [columns, fields.data]);

  const filter = useMemo(
    () => (filterConditions.length > 0 ? { and: filterConditions } : undefined),
    [filterConditions],
  );

  const records = useRecords(workspaceId, objectApiName, {
    filter,
    sort,
    q: search || undefined,
    limit: 50,
  });
  const createRecord = useCreateRecord(workspaceId, objectApiName);
  const updateRecord = useUpdateRecord(workspaceId, objectApiName);
  const bulkUpdate = useBulkUpdateRecords(workspaceId, objectApiName);
  const bulkDelete = useBulkDeleteRecords(workspaceId, objectApiName);

  const objectDef = objects.data?.find((item) => item.apiName === objectApiName);
  const rows = records.data?.pages.flatMap((page) => page.items) ?? [];
  const membersById = new Map((members.data ?? []).map((member) => [member.id, member]));
  const columnDefs = buildColumnDefs(columns ?? [], fields.data ?? [], t);

  function applyView(view: ViewDto | null) {
    setSelectedViewId(view?.id ?? null);
    if (!view) {
      setFilterConditions([]);
      setSort(DEFAULT_SORT);
      setColumns(defaultColumns(fields.data ?? []));
      return;
    }
    const flatConditions =
      view.filters && 'and' in view.filters && Array.isArray(view.filters.and)
        ? (view.filters.and as FilterCondition[])
        : [];
    setFilterConditions(flatConditions);
    setSort(view.sort ?? DEFAULT_SORT);
    setColumns(view.columns.length > 0 ? view.columns : defaultColumns(fields.data ?? []));
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set());
  }

  function handleEditCell(recordId: string, key: string, value: unknown) {
    if (key === 'name') {
      updateRecord.mutate({ id: recordId, body: { name: String(value) } });
    } else if (key === 'owner_id') {
      updateRecord.mutate({ id: recordId, body: { ownerId: String(value) } });
    } else {
      updateRecord.mutate({ id: recordId, body: { data: { [key]: value } } });
    }
  }

  async function handleBulkEdit(fieldApiName: string, value: unknown) {
    await bulkUpdate.mutateAsync({ ids: [...selectedIds], data: { [fieldApiName]: value } });
    setBulkEditOpen(false);
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(t('records.bulk.confirmDelete', { count: selectedIds.size }))) return;
    await bulkDelete.mutateAsync([...selectedIds]);
    setSelectedIds(new Set());
  }

  if (objects.isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!objectDef) {
    return (
      <RecordsEmptyState
        title={t('records.notFound.title')}
        description={t('records.notFound.description')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{objectDef.labelPlural}</h1>
          <p className="text-sm text-muted-foreground">
            {t('records.count', { count: rows.length })}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {t('records.create.action', { label: objectDef.labelSingular })}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SavedViewsBar
          workspaceId={workspaceId}
          objectApiName={objectApiName}
          views={views.data ?? []}
          selectedViewId={selectedViewId}
          onSelectView={applyView}
          currentState={{ filters: filterConditions, sort, columns: columns ?? [] }}
        />
        <div className="flex items-center gap-2">
          <Input
            placeholder={t('records.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-56"
          />
          <ColumnPicker fields={fields.data ?? []} columns={columns ?? []} onChange={setColumns} />
          <ExportButton
            workspaceId={workspaceId}
            objectApiName={objectApiName}
            filter={filter}
            sort={sort}
            columns={columns ?? []}
          />
        </div>
      </div>

      <div className="rounded-md border p-3">
        <FilterBuilder
          fields={fields.data ?? []}
          value={filterConditions}
          onChange={setFilterConditions}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <SortControl fields={fields.data ?? []} value={sort} onChange={setSort} />
        {selectedIds.size > 0 ? (
          <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-1.5 text-sm">
            <span>{t('records.bulk.selected', { count: selectedIds.size })}</span>
            <Button size="sm" variant="outline" onClick={() => setBulkEditOpen(true)}>
              {t('records.bulk.editField')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void handleBulkDelete()}>
              <Trash2 className="size-4" />
              {t('records.bulk.delete')}
            </Button>
          </div>
        ) : null}
      </div>

      {records.isPending || fields.isPending || columns === null ? (
        <Skeleton className="h-96 w-full" />
      ) : rows.length === 0 ? (
        <RecordsEmptyState
          title={t('records.empty.title')}
          description={t('records.empty.description')}
          action={
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t('records.create.action', { label: objectDef.labelSingular })}
            </Button>
          }
        />
      ) : (
        <RecordTable
          columns={columnDefs}
          records={rows}
          objectApiName={objectApiName}
          workspaceId={workspaceId}
          membersById={membersById}
          members={members.data ?? []}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onEditCell={handleEditCell}
          onEndReached={() => {
            if (records.hasNextPage && !records.isFetchingNextPage) {
              void records.fetchNextPage();
            }
          }}
        />
      )}

      <RecordFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
        fields={fields.data ?? []}
        isPending={createRecord.isPending}
        onSubmit={async (body) => {
          await createRecord.mutateAsync(body);
          setCreateOpen(false);
        }}
      />

      <BulkEditDialog
        open={bulkEditOpen}
        onOpenChange={setBulkEditOpen}
        workspaceId={workspaceId}
        fields={fields.data ?? []}
        selectedCount={selectedIds.size}
        isPending={bulkUpdate.isPending}
        onSubmit={(fieldApiName, value) => void handleBulkEdit(fieldApiName, value)}
      />
    </div>
  );
}
