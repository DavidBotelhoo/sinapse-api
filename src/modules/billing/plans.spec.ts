import { SubscriptionPlan } from '../../generated/prisma/enums';
import { addPlanPeriod, buildPlans, priceFor } from './plans';

describe('plans', () => {
  it('anual = 10 mensais: "2 meses gratis" e equivalente por mes', () => {
    expect(buildPlans({ monthlyCents: 2990, yearlyCents: 29900 })).toEqual([
      {
        plan: 'MONTHLY',
        interval: 'MONTH',
        priceCents: 2990,
        monthlyEquivalentCents: 2990,
        freeMonths: 0,
      },
      {
        plan: 'YEARLY',
        interval: 'YEAR',
        priceCents: 29900,
        monthlyEquivalentCents: 2492,
        freeMonths: 2,
      },
    ]);
  });

  it('nao arredonda a economia para cima (1,97 mes vira 1)', () => {
    const [, yearly] = buildPlans({ monthlyCents: 2990, yearlyCents: 30000 });
    expect(yearly!.freeMonths).toBe(1);
  });

  it('anual sem desconto (ou mais caro): 0 meses gratis', () => {
    expect(buildPlans({ monthlyCents: 1000, yearlyCents: 12000 })[1]!.freeMonths).toBe(0);
    expect(buildPlans({ monthlyCents: 1000, yearlyCents: 15000 })[1]!.freeMonths).toBe(0);
  });

  it('preco de cada plano', () => {
    const prices = { monthlyCents: 2990, yearlyCents: 29900 };
    expect(priceFor(SubscriptionPlan.MONTHLY, prices)).toBe(2990);
    expect(priceFor(SubscriptionPlan.YEARLY, prices)).toBe(29900);
  });

  it('periodo: um mes ou um ano de calendario', () => {
    const from = new Date('2026-11-15T10:00:00.000Z');
    expect(addPlanPeriod(from, SubscriptionPlan.MONTHLY).toISOString()).toBe(
      '2026-12-15T10:00:00.000Z',
    );
    expect(addPlanPeriod(from, SubscriptionPlan.YEARLY).toISOString()).toBe(
      '2027-11-15T10:00:00.000Z',
    );
  });
});
