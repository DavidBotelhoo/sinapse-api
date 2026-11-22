import type { SubscriptionModel } from '../../generated/prisma/models';
import type { UserRole } from '../../generated/prisma/enums';
import type { SubscriptionSummaryDto } from './dto/billing.dto';
import { subscriptionAccess } from './subscription-access';

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toSubscriptionSummary(
  role: UserRole,
  subscription: SubscriptionModel | null,
  now: Date = new Date(),
): SubscriptionSummaryDto {
  const access = subscriptionAccess(role, subscription, now);
  if (access.lifetime || !subscription) {
    return {
      status: access.status,
      hasAccess: access.hasAccess,
      lifetime: access.lifetime,
      accessUntil: null,
      plan: null,
      trialEndsAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      paymentMethodLabel: null,
      graceUntil: null,
      paymentFailedAt: null,
    };
  }
  return {
    status: access.status,
    hasAccess: access.hasAccess,
    lifetime: false,
    accessUntil: iso(access.accessUntil),
    plan: subscription.plan,
    trialEndsAt: iso(subscription.trialEndsAt),
    currentPeriodEnd: iso(subscription.currentPeriodEnd),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    paymentMethodLabel: subscription.paymentMethodLabel,
    graceUntil: iso(subscription.graceUntil),
    paymentFailedAt: iso(subscription.paymentFailedAt),
  };
}
