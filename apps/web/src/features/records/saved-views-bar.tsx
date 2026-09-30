import type { FilterCondition, RecordSort, ViewDto } from '@cragfoge/shared';
import { Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateView, useDeleteView, useUpdateView } from './view-mutations';

type Props = {
  workspaceId: string | null;
  objectApiName: string;
  views: ViewDto[];
  selectedViewId: string | null;
  onSelectView: (view: ViewDto | null) => void;
  currentState: { filters: FilterCondition[]; sort: RecordSort; columns: string[] };
};

export function SavedViewsBar({
  workspaceId,
  objectApiName,
  views,
  selectedViewId,
  onSelectView,
  currentState,
}: Props) {
  const { t } = useTranslation();
  const [newViewName, setNewViewName] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);
  const createView = useCreateView(workspaceId, objectApiName);
  const updateView = useUpdateView(workspaceId, objectApiName);
  const deleteView = useDeleteView(workspaceId, objectApiName);

  const selectedView = views.find((view) => view.id === selectedViewId) ?? null;

  async function saveAsNew() {
    if (!newViewName.trim()) return;
    const created = await createView.mutateAsync({
      name: newViewName.trim(),
      filters: { and: currentState.filters },
      sort: currentState.sort,
      columns: currentState.columns,
      isShared: false,
    });
    setNewViewName('');
    setSaveOpen(false);
    onSelectView(created);
  }

  async function updateCurrent() {
    if (!selectedView) return;
    const updated = await updateView.mutateAsync({
      viewId: selectedView.id,
      body: {
        filters: { and: currentState.filters },
        sort: currentState.sort,
        columns: currentState.columns,
      },
    });
    onSelectView(updated);
  }

  async function removeCurrent() {
    if (!selectedView) return;
    if (!window.confirm(t('records.views.confirmDelete', { name: selectedView.name }))) {
      return;
    }
    await deleteView.mutateAsync(selectedView.id);
    onSelectView(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={selectedViewId ?? '__default__'}
        onValueChange={(next) =>
          onSelectView(next === '__default__' ? null : (views.find((v) => v.id === next) ?? null))
        }
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__default__">{t('records.views.default')}</SelectItem>
          {views.map((view) => (
            <SelectItem key={view.id} value={view.id}>
              {view.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedView ? (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void updateCurrent()}
            disabled={updateView.isPending}
          >
            {t('records.views.update')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void removeCurrent()}
            disabled={deleteView.isPending}
          >
            <Trash2 className="size-4" />
          </Button>
        </>
      ) : null}

      <Popover open={saveOpen} onOpenChange={setSaveOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <Save className="size-4" />
            {t('records.views.saveAsNew')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="space-y-2">
            <Input
              placeholder={t('records.views.namePlaceholder')}
              value={newViewName}
              onChange={(event) => setNewViewName(event.target.value)}
            />
            <Button
              size="sm"
              className="w-full"
              onClick={() => void saveAsNew()}
              disabled={createView.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
