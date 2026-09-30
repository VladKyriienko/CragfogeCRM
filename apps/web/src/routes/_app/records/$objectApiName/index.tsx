import { createFileRoute } from '@tanstack/react-router';
import { RecordsListPage } from '@/features/records/records-list-page';

export const Route = createFileRoute('/_app/records/$objectApiName/')({
  component: RecordsListPage,
});
