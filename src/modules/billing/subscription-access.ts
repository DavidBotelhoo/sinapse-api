import { SubscriptionStatus, UserRole } from '../../generated/prisma/enums';

// Situacao da assinatura vista pelo app (docs/dominio.md > Assinatura). O status gravado vem
// dos webhooks; aqui ele e lido junto com as datas, entao um teste vencido, um prazo de
// pagamento vencido ou um cancelamento cujo periodo acabou aparecem como EXPIRED mesmo
// sem um evento novo do gateway. ADMIN e SUPER_ADMIN tem acesso vitalicio.

export type EffectiveStatus = 'NONE' | SubscriptionStatus;

export const LIFETIME_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
]);

export interface SubscriptionDates {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
}

export interface SubscriptionAccess {
  status: EffectiveStatus;
  hasAccess: boolean;
  lifetime: boolean;
  // Ate quando o acesso vale (null: vitalicio, assinatura ativa sem data ou sem acesso).
  accessUntil: Date | null;
}

const NO_ACCESS = (status: EffectiveStatus): SubscriptionAccess => ({
  status,
  hasAccess: false,
  lifetime: false,
  accessUntil: null,
});

const until = (status: EffectiveStatus, end: Date | null, now: Date): SubscriptionAccess =>
  end && now.getTime() < end.getTime()
    ? { status, hasAccess: true, lifetime: false, accessUntil: end }
    : NO_ACCESS(SubscriptionStatus.EXPIRED);

export function subscriptionAccess(
  role: UserRole,
  subscription: SubscriptionDates | null,
  now: Date,
): SubscriptionAccess {
  if (LIFETIME_ROLES.has(role)) {
    return {
      status: SubscriptionStatus.ACTIVE,
      hasAccess: true,
      lifetime: true,
      accessUntil: null,
    };
  }
  if (!subscription) return NO_ACCESS('NONE');

  switch (subscription.status) {
    case SubscriptionStatus.TRIALING:
      return until(SubscriptionStatus.TRIALING, subscription.trialEndsAt, now);
    case SubscriptionStatus.ACTIVE:
      return {
        status: SubscriptionStatus.ACTIVE,
        hasAccess: true,
        lifetime: false,
        accessUntil: subscription.currentPeriodEnd,
      };
    case SubscriptionStatus.PAST_DUE:
      return until(SubscriptionStatus.PAST_DUE, subscription.graceUntil, now);
    case SubscriptionStatus.CANCELED:
      return until(SubscriptionStatus.CANCELED, subscription.currentPeriodEnd, now);
    case SubscriptionStatus.EXPIRED:
      return NO_ACCESS(SubscriptionStatus.EXPIRED);
  }
}
