import {
  onboardingChecklistSchema,
  type OnboardingChecklist,
  type OnboardingChecklistStepId,
} from '@cragfoge/shared';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { getStoredWorkspaceId } from '@/lib/workspace';

const STEP_HREF: Record<
  OnboardingChecklistStepId,
  '/records/$objectApiName' | '/settings' | '/records'
> = {
  import_contacts: '/records/$objectApiName',
  invite_team: '/settings',
  customize_fields: '/settings',
  create_record: '/records',
  connect_integration: '/settings',
};

export function OnboardingChecklistCard() {
  const { t } = useTranslation();
  const workspaceId = getStoredWorkspaceId();
  const queryClient = useQueryClient();
  const checklist = useQuery({
    queryKey: ['onboarding', workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () =>
      onboardingChecklistSchema.parse(
        await apiFetch(`/workspaces/${workspaceId}/onboarding`, { workspaceId }),
      ),
  });

  const patch = useMutation({
    mutationFn: async (body: { dismissStep?: OnboardingChecklistStepId; dismissedAll?: boolean }) =>
      onboardingChecklistSchema.parse(
        await apiFetch(`/workspaces/${workspaceId}/onboarding`, {
          method: 'PATCH',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(['onboarding', workspaceId], data);
    },
  });

  if (!workspaceId || checklist.isPending || checklist.isError || !checklist.data) {
    return null;
  }
  if (checklist.data.dismissedAll) {
    return null;
  }
  const visible = checklist.data.steps.filter((step) => !step.dismissed);
  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{t('dashboard.checklist.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('dashboard.checklist.description')}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => patch.mutate({ dismissedAll: true })}
          disabled={patch.isPending}
        >
          {t('dashboard.checklist.dismissAll')}
        </Button>
      </div>
      <ol className="mt-4 space-y-2">
        {visible.map((step, index) => (
          <ChecklistRow
            key={step.id}
            index={index + 1}
            step={step}
            onDismiss={() => patch.mutate({ dismissStep: step.id })}
          />
        ))}
      </ol>
    </div>
  );
}

function ChecklistRow({
  index,
  step,
  onDismiss,
}: {
  index: number;
  step: OnboardingChecklist['steps'][number];
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <div className="flex items-center gap-3">
        <span
          className={
            step.completed
              ? 'flex size-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white'
              : 'flex size-6 items-center justify-center rounded-full border text-xs text-muted-foreground'
          }
        >
          {step.completed ? '✓' : index}
        </span>
        <div>
          <p className="text-sm font-medium">{t(`dashboard.checklist.steps.${step.id}.title`)}</p>
          <p className="text-xs text-muted-foreground">
            {t(`dashboard.checklist.steps.${step.id}.description`)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {!step.completed ? (
          <Button variant="outline" size="sm" asChild>
            {step.id === 'import_contacts' ? (
              <Link to="/records/$objectApiName" params={{ objectApiName: 'people' }}>
                {t('dashboard.checklist.open')}
              </Link>
            ) : (
              <Link to={STEP_HREF[step.id]}>{t('dashboard.checklist.open')}</Link>
            )}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t('dashboard.checklist.dismiss')}
        </Button>
      </div>
    </li>
  );
}
