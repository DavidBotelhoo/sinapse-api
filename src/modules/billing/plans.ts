import { SubscriptionPlan } from '../../generated/prisma/enums';

// Planos a partir dos precos da configuracao (nunca fixos no codigo).

export const BILLING_CURRENCY = 'BRL';

export type PlanInterval = 'MONTH' | 'YEAR';

export interface PlanOption {
  plan: SubscriptionPlan;
  interval: PlanInterval;
  priceCents: number;
  // "Equivale a R$ X por mes" (arredondado ao centavo).
  monthlyEquivalentCents: number;
  // "2 meses gratis": quantos meses inteiros o anual economiza contra 12 mensais (nunca exagera).
  freeMonths: number;
}

export interface PlanPrices {
  monthlyCents: number;
  yearlyCents: number;
}

export function buildPlans({ monthlyCents, yearlyCents }: PlanPrices): PlanOption[] {
  const savedCents = 12 * monthlyCents - yearlyCents;
  return [
    {
      plan: SubscriptionPlan.MONTHLY,
      interval: 'MONTH',
      priceCents: monthlyCents,
      monthlyEquivalentCents: monthlyCents,
      freeMonths: 0,
    },
    {
      plan: SubscriptionPlan.YEARLY,
      interval: 'YEAR',
      priceCents: yearlyCents,
      monthlyEquivalentCents: Math.round(yearlyCents / 12),
      freeMonths: savedCents > 0 ? Math.floor(savedCents / monthlyCents) : 0,
    },
  ];
}

export function priceFor(plan: SubscriptionPlan, prices: PlanPrices): number {
  return plan === SubscriptionPlan.YEARLY ? prices.yearlyCents : prices.monthlyCents;
}

// Fim do periodo pago de um plano, a partir de uma data (mes e ano de calendario, em UTC).
export function addPlanPeriod(from: Date, plan: SubscriptionPlan): Date {
  const end = new Date(from.getTime());
  if (plan === SubscriptionPlan.YEARLY) end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return end;
}
