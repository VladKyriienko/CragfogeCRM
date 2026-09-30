import { healthResponseSchema } from '@cragfoge/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { OnboardingChecklistCard } from './onboarding-checklist';

async function fetchHealth() {
  const response = await fetch('/api/health');
  const body: unknown = await response.json();
  return healthResponseSchema.parse(body);
}

export function DashboardPage() {
  const { t } = useTranslation();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  });

  return (
    <section className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('dashboard.description')}</p>

      <OnboardingChecklistCard />

      <div className="mt-8 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">{t('dashboard.apiStatus')}</h2>
          <Button variant="outline" size="sm" onClick={() => void health.refetch()}>
            {t('dashboard.refresh')}
          </Button>
        </div>
        {health.isPending ? (
          <p className="mt-3 text-sm text-muted-foreground">{t('dashboard.loading')}</p>
        ) : null}
        {health.isError ? (
          <p className="mt-3 text-sm text-destructive">{t('dashboard.unavailable')}</p>
        ) : null}
        {health.data ? (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatusItem label={t('dashboard.database')} status={health.data.checks.database} />
            <StatusItem label={t('dashboard.redis')} status={health.data.checks.redis} />
          </dl>
        ) : null}
      </div>
    </section>
  );
}

function StatusItem({ label, status }: { label: string; status: 'ok' | 'error' }) {
  const { t } = useTranslation();
  const ok = status === 'ok';

  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <dt className="text-sm">{label}</dt>
      <dd className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          className={
            ok ? 'size-2 rounded-full bg-emerald-600' : 'size-2 rounded-full bg-destructive'
          }
        />
        {ok ? t('dashboard.ok') : t('dashboard.error')}
      </dd>
    </div>
  );
}
