import type { MemberPickerItem, RecordDto } from '@cragfoge/shared';
import { createColumnHelper, tableFeatures, useTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMemo, useRef, type UIEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RecordCellValue, type ColumnDef } from './record-cell';
import { RecordFieldInput } from './record-field-input';

// Stable table configuration: no extra features are needed since sorting/filtering/pagination
// are all handled server-side by the records API.
const features = tableFeatures({});
const columnHelper = createColumnHelper<typeof features, RecordDto>();

type Props = {
  columns: ColumnDef[];
  records: RecordDto[];
  objectApiName: string;
  workspaceId: string | null;
  membersById: Map<string, MemberPickerItem>;
  members: MemberPickerItem[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string, checked: boolean) => void;
  onToggleSelectAll: (checked: boolean) => void;
  onEditCell: (recordId: string, key: string, value: unknown) => void;
  onEndReached: () => void;
};

export function RecordTable({
  columns,
  records,
  objectApiName,
  workspaceId,
  membersById,
  members,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onEditCell,
  onEndReached,
}: Props) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);

  const tableColumns = useMemo(
    () => columns.map((column) => columnHelper.display({ id: column.key, header: column.label })),
    [columns],
  );

  const table = useTable({
    features,
    columns: tableColumns,
    data: records,
    getRowId: (row) => row.id,
  });
  const rows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44,
    overscan: 12,
  });

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      onEndReached();
    }
  }

  const allSelected = records.length > 0 && records.every((record) => selectedIds.has(record.id));

  function renderCell(column: ColumnDef, record: RecordDto) {
    if (column.key === 'owner_id') {
      return (
        <Select
          value={record.ownerId}
          onValueChange={(next) => onEditCell(record.id, 'owner_id', next)}
        >
          <SelectTrigger className="h-8 border-transparent bg-transparent px-1 hover:border-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (column.field && column.field.visibility === 'write' && column.field.type !== 'relation') {
      return (
        <RecordFieldInput
          workspaceId={workspaceId}
          field={column.field}
          value={record.data[column.field.apiName] ?? null}
          onChange={(value) => onEditCell(record.id, column.field!.apiName, value)}
        />
      );
    }

    return (
      <RecordCellValue
        column={column}
        record={record}
        objectApiName={objectApiName}
        membersById={membersById}
      />
    );
  }

  return (
    <div
      ref={parentRef}
      onScroll={handleScroll}
      className="relative max-h-[70vh] overflow-auto rounded-md border"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => onToggleSelectAll(checked === true)}
                aria-label={t('records.selectAll')}
              />
            </TableHead>
            {table
              .getHeaderGroups()
              .map((group) =>
                group.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                )),
              )}
          </TableRow>
        </TableHeader>
        <TableBody>
          <tr style={{ height: virtualizer.getVirtualItems()[0]?.start ?? 0 }} aria-hidden />
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]!;
            const record = row.original;
            return (
              <TableRow
                key={row.id}
                data-state={selectedIds.has(record.id) ? 'selected' : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(record.id)}
                    onCheckedChange={(checked) => onToggleSelect(record.id, checked === true)}
                    aria-label={t('records.selectRow')}
                  />
                </TableCell>
                {columns.map((column) => (
                  <TableCell key={column.key} className="min-w-32">
                    {renderCell(column, record)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          <tr
            style={{
              height:
                (virtualizer.getTotalSize() ?? 0) -
                (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
            }}
            aria-hidden
          />
        </TableBody>
      </Table>
    </div>
  );
}
