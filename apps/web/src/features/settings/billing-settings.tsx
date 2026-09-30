import {
  activateLicenseBodySchema,
  activatedLicenseSchema,
  checkoutSessionSchema,
  portalSessionSchema,
} from '@cragfoge/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useEntitlements } from '@/features/billing/use-entitlements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api';

export function BillingSettings({ workspaceId }: { workspaceId: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const entitlements = useEntitlements(workspaceId);
  const [error, setError] = useState<string | null>(null);

  const licenseForm = useForm<z.infer<typeof activateLicenseBodySchema>>({
    resolver: zodResolver(activateLicenseBodySchema),
    defaultValues: { licenseKey: '' },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const result = checkoutSessionSchema.parse(
        await apiFetch<unknown>('/billing/checkout', {
          method: 'POST',
          workspaceId,
          body: JSON.stringify({}),
        }),
      );
      return result;
    },
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (err: Error) => setError(err.message),
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const result = portalSessionSchema.parse(
        await apiFetch<unknown>('/billing/portal', {
          method: 'POST',
          workspaceId,
          body: JSON.stringify({}),
        }),
      );
      return result;
    },
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (err: Error) => setError(err.message),
  });

  const licenseMutation = useMutation({
    mutationFn: async (body: z.infer<typeof activateLicenseBodySchema>) =>
      activatedLicenseSchema.parse(
        await apiFetch<unknown>('/billing/license', {
          method: 'POST',
          workspaceId,
          body: JSON.stringify(body),
        }),
      ),
    onSuccess: async () => {
      licenseForm.reset();
      await queryClient.invalidateQueries({ queryKey: ['entitlements', workspaceId] });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (entitlements.isPending) {
    return <p className="text-sm text-muted-foreground">{t('settings.loading')}</p>;
  }

  if (entitlements.isError || !entitlements.data) {
    return <p className="text-sm text-muted-foreground">{t('billing.loadError')}</p>;
  }

  const status = entitlements.data;

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t('billing.mode')}</dt>
          <dd className="font-medium">
            {status.deploymentMode === 'cloud'
              ? t('billing.modeCloud')
              : t('billing.modeSelfhost')}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('billing.status')}</dt>
          <dd className="font-medium">{t(`billing.statuses.${status.billingStatus}`)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('billing.seats')}</dt>
          <dd className="font-medium">
            {status.seatLimit == null
              ? t('billing.seatsUnlimited', { used: status.seatsUsed })
              : t('billing.seatsUsed', { used: status.seatsUsed, limit: status.seatLimit })}
          </dd>
        </div>
        {status.trialEndsAt ? (
          <div>
            <dt className="text-muted-foreground">{t('billing.trialEnds')}</dt>
            <dd className="font-medium">{new Date(status.trialEndsAt).toLocaleString()}</dd>
          </div>
        ) : null}
        {status.licensee ? (
          <div>
            <dt className="text-muted-foreground">{t('billing.licensee')}</dt>
            <dd className="font-medium">{status.licensee}</dd>
          </div>
        ) : null}
      </dl>

      {status.deploymentMode === 'cloud' ? (
        <div className="flex flex-wrap gap-2">
          {status.billingStatus === 'trialing' || status.billingStatus === 'canceled' ? (
            <Button
              type="button"
              disabled={checkoutMutation.isPending}
              onClick={() => {
                setError(null);
                checkoutMutation.mutate();
              }}
            >
              {t('billing.checkout')}
            </Button>
          ) : null}
          {status.billingStatus === 'active' || status.billingStatus === 'past_due' ? (
            <Button
              type="button"
              variant="outline"
              disabled={portalMutation.isPending}
              onClick={() => {
                setError(null);
                portalMutation.mutate();
              }}
            >
              {t('billing.portal')}
            </Button>
          ) : null}
        </div>
      ) : (
        <form
          className="space-y-3 rounded-md border p-4"
          onSubmit={licenseForm.handleSubmit((values) => {
            setError(null);
            licenseMutation.mutate(values);
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="license-key">{t('billing.licenseKey')}</Label>
            <Input id="license-key" {...licenseForm.register('licenseKey')} />
            <p className="text-xs text-muted-foreground">
              {status.hasValidLicense
                ? t('billing.licenseActive')
                : t('billing.licenseFreeMode', { limit: 3 })}
            </p>
          </div>
          <Button type="submit" disabled={licenseMutation.isPending}>
            {t('billing.activateLicense')}
          </Button>
        </form>
      )}
    </div>
  );
}
