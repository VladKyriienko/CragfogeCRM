import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-lg font-semibold tracking-tight">{t('app.name')}</p>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-xs">{children}</div>
      </div>
    </div>
  );
}
