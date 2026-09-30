import { useTranslation } from 'react-i18next';
import { useEntitlements } from './use-entitlements';

export function EntitlementsBanner({ workspaceId }: { workspaceId: string | null }) {
  const { t } = useTranslation();
  const entitlements = useEntitlements(workspaceId);

  if (!entitlements.data) {
    return null;
  }

  const status = entitlements.data;
  const messages: string[] = [];

  if (status.isReadOnly) {
    messages.push(t('billing.banner.readOnly'));
  } else if (status.pastDueGraceActive) {
    messages.push(t('billing.banner.pastDue'));
  }

  if (status.overSeatLimit || (status.seatLimit != null && status.seatsUsed >= status.seatLimit)) {
    if (status.deploymentMode === 'selfhost' && !status.hasValidLicense) {
      messages.push(t('billing.banner.freeSeatLimit', { limit: status.seatLimit }));
    } else if (status.overSeatLimit) {
      messages.push(t('billing.banner.overSeatLimit', { limit: status.seatLimit }));
    } else if (status.seatLimit != null && status.seatsUsed >= status.seatLimit) {
      messages.push(t('billing.banner.seatLimitReached', { limit: status.seatLimit }));
    }
  }

  if (status.deploymentMode === 'cloud' && status.billingStatus === 'trialing' && status.trialEndsAt) {
    messages.push(
      t('billing.banner.trial', {
        date: new Date(status.trialEndsAt).toLocaleDateString(),
      }),
    );
  }

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950 md:px-6">
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  );
}
