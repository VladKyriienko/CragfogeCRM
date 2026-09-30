import { createFileRoute } from '@tanstack/react-router';
import { RecordDetailPage } from '@/features/records/record-detail-page';

export const Route = createFileRoute('/_app/records/$objectApiName/$recordId')({
  component: RecordDetailPage,
});
