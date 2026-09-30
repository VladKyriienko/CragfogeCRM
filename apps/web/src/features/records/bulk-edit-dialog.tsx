import type { FieldDefinitionWithVisibilityDto } from '@cragfoge/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RecordFieldInput } from './record-field-input';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  fields: FieldDefinitionWithVisibilityDto[];
  selectedCount: number;
  onSubmit: (fieldApiName: string, value: unknown) => void;
  isPending: boolean;
};

export function BulkEditDialog({
  open,
  onOpenChange,
  workspaceId,
  fields,
  selectedCount,
  onSubmit,
  isPending,
}: Props) {
  const { t } = useTranslation();
  const writableFields = fields.filter(
    (field) => field.visibility === 'write' && field.type !== 'relation',
  );
  const [fieldApiName, setFieldApiName] = useState(writableFields[0]?.apiName ?? '');
  const [value, setValue] = useState<unknown>(null);
  const selectedField = writableFields.find((field) => field.apiName === fieldApiName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('records.bulk.editTitle', { count: selectedCount })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Select value={fieldApiName} onValueChange={setFieldApiName}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {writableFields.map((field) => (
                <SelectItem key={field.apiName} value={field.apiName}>
                  {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedField ? (
            <RecordFieldInput
              workspaceId={workspaceId}
              field={selectedField}
              value={value}
              onChange={setValue}
            />
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!selectedField || isPending}
            onClick={() => selectedField && onSubmit(selectedField.apiName, value)}
          >
            {t('records.bulk.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
