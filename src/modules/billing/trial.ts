import { SubscriptionStatus } from '../../generated/prisma/enums';

// Teste gratis do cadastro (decisao em aberto 4): sem cartao e sem gateway ainda, por isso
// o provider "none". O primeiro evento do gateway troca o provider.
export const TRIAL_PROVIDER = 'none';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function trialSubscription(
  now: Date,
  trialDays: number,
): { provider: string; status: SubscriptionStatus; trialEndsAt: Date } {
  return {
    provider: TRIAL_PROVIDER,
    status: SubscriptionStatus.TRIALING,
    trialEndsAt: new Date(now.getTime() + trialDays * MS_PER_DAY),
  };
}
