import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlaceholderPage } from '@/features/shell/placeholder-page';

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  const { t } = useTranslation();

  return (
    <>
      <title>{t('app.name')}</title>
      <Outlet />
    </>
  );
}

function NotFound() {
  return <PlaceholderPage titleKey="notFound.title" descriptionKey="notFound.description" />;
}
