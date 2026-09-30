import {
  recordSchema,
  type FieldDefinitionWithVisibilityDto,
  type RecordDto,
} from '@cragfoge/shared';
import { Link } from '@tanstack/react-router';
import { useQueries } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';

type Props = {
  workspaceId: string | null;
  field: FieldDefinitionWithVisibilityDto;
  record: RecordDto;
};

/** Shows linked records for a single relation field on the record detail page. */
export function RelatedRecordsField({ workspaceId, field, record }: Props) {
  const { t } = useTranslation();
  const relatedObjectApiName =
    typeof field.options.relatedObjectApiName === 'string'
      ? field.options.relatedObjectApiName
      : '';
  const ids = record.relations[field.apiName] ?? [];

  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['records', workspaceId, relatedObjectApiName, 'detail', id],
      enabled: Boolean(workspaceId && relatedObjectApiName),
      queryFn: async () =>
        recordSchema.parse(
          await apiFetch<unknown>(`/objects/${relatedObjectApiName}/records/${id}`, {
            workspaceId,
          }),
        ),
    })),
  });

  if (ids.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('records.detail.noRelated')}</p>;
  }

  return (
    <ul className="space-y-1 text-sm">
      {results.map((result, index) => (
        <li key={ids[index]}>
          {result.data ? (
            <Link
              to="/records/$objectApiName/$recordId"
              params={{ objectApiName: relatedObjectApiName, recordId: result.data.id }}
              className="text-primary hover:underline"
            >
              {result.data.name}
            </Link>
          ) : (
            <span className="text-muted-foreground">…</span>
          )}
        </li>
      ))}
    </ul>
  );
}
