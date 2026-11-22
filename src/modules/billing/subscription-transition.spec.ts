import { SubscriptionStatus } from '../../generated/prisma/enums';
import type { BillingEventType, NormalizedBillingEvent } from './billing-provider';
import { applyBillingEvent, type CurrentSubscription } from './subscription-transition';

const T0 = new Date('2026-11-15T12:00:00.000Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);
const OPTS = { providerName: 'fake', graceDays: 5 };
const USER = '0b6f7d2e-3c1a-4f5e-9a8b-1c2d3e4f5a6b';

const event = (
  type: BillingEventType | null,
  patch: Partial<NormalizedBillingEvent> = {},
): NormalizedBillingEvent => ({
  eventId: `evt_${type ?? 'x'}`,
  rawType: type ?? 'customer.updated',
  type,
  occurredAt: T0,
  userId: USER,
  customerId: 'cus_1',
  subscriptionId: 'sub_1',
  plan: 'MONTHLY',
  currentPeriodEnd: new Date('2026-12-15T12:00:00.000Z'),
  paymentMethodLabel: 'Visa final 4417',
  invoice: { id: 'in_1', amountCents: 2990, currency: 'BRL' },
  payload: {},
  ...patch,
});

const trial: CurrentSubscription = {
  status: SubscriptionStatus.TRIALING,
  plan: null,
  trialEndsAt: new Date('2026-11-20T12:00:00.000Z'),
  currentPeriodEnd: null,
  paymentMethodLabel: null,
  providerCustomerId: null,
  providerSubscriptionId: null,
  graceUntil: null,
  paymentFailedAt: null,
  lastEventAt: null,
};

describe('applyBillingEvent', () => {
  it('pagamento aprovado: ACTIVE, com plano, periodo, cartao e Invoice PAID', () => {
    const result = applyBillingEvent(trial, event('payment.succeeded'), OPTS);
    expect(result.subscription).toMatchObject({
      provider: 'fake',
      status: 'ACTIVE',
      plan: 'MONTHLY',
      currentPeriodEnd: new Date('2026-12-15T12:00:00.000Z'),
      paymentMethodLabel: 'Visa final 4417',
      providerCustomerId: 'cus_1',
      providerSubscriptionId: 'sub_1',
      graceUntil: null,
      paymentFailedAt: null,
      cancelAtPeriodEnd: false,
      lastEventAt: T0,
      trialEndsAt: trial.trialEndsAt,
    });
    expect(result.invoice).toEqual({
      providerInvoiceId: 'in_1',
      plan: 'MONTHLY',
      amountCents: 2990,
      currency: 'BRL',
      status: 'PAID',
      paymentMethodLabel: 'Visa final 4417',
      paidAt: T0,
    });
  });

  it('pagamento recusado: PAST_DUE, prazo de N dias e Invoice FAILED', () => {
    const active = applyBillingEvent(trial, event('payment.succeeded'), OPTS).subscription!;
    const result = applyBillingEvent(
      { ...trial, ...active },
      event('payment.failed', {
        occurredAt: at(60),
        invoice: { id: 'in_2', amountCents: 2990, currency: 'BRL' },
      }),
      OPTS,
    );
    expect(result.subscription).toMatchObject({
      status: 'PAST_DUE',
      paymentFailedAt: at(60),
      graceUntil: new Date(at(60).getTime() + 5 * 24 * 60 * 60 * 1000),
    });
    expect(result.invoice).toMatchObject({
      providerInvoiceId: 'in_2',
      status: 'FAILED',
      paidAt: null,
    });
  });

  it('nova recusa nao estende o prazo nem troca a data da primeira', () => {
    const first = applyBillingEvent(trial, event('payment.failed'), OPTS).subscription!;
    const second = applyBillingEvent(
      { ...trial, ...first },
      event('payment.failed', { occurredAt: at(24 * 60) }),
      OPTS,
    ).subscription!;
    expect(second.graceUntil).toEqual(first.graceUntil);
    expect(second.paymentFailedAt).toEqual(T0);
    expect(second.lastEventAt).toEqual(at(24 * 60));
  });

  it('aprovado depois da recusa limpa o prazo', () => {
    const failed = applyBillingEvent(trial, event('payment.failed'), OPTS).subscription!;
    const paid = applyBillingEvent(
      { ...trial, ...failed },
      event('payment.succeeded', { occurredAt: at(5) }),
      OPTS,
    ).subscription!;
    expect(paid).toMatchObject({ status: 'ACTIVE', graceUntil: null, paymentFailedAt: null });
  });

  it('cancelada: CANCELED com cancelAtPeriodEnd e o periodo pago mantido', () => {
    const active = applyBillingEvent(trial, event('payment.succeeded'), OPTS).subscription!;
    const canceled = applyBillingEvent(
      { ...trial, ...active },
      event('subscription.canceled', { occurredAt: at(10), currentPeriodEnd: null, invoice: null }),
      OPTS,
    );
    expect(canceled.subscription).toMatchObject({
      status: 'CANCELED',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date('2026-12-15T12:00:00.000Z'),
    });
    expect(canceled.invoice).toBeNull();
  });

  it('teste terminado: EXPIRED para quem esta em teste ou sem assinatura', () => {
    expect(applyBillingEvent(trial, event('trial.ended'), OPTS).subscription).toMatchObject({
      status: 'EXPIRED',
      trialEndsAt: T0,
    });
    expect(applyBillingEvent(null, event('trial.ended'), OPTS).subscription).toMatchObject({
      status: 'EXPIRED',
    });
  });

  it('teste terminado nao mexe em quem ja assinou', () => {
    const active = applyBillingEvent(trial, event('payment.succeeded'), OPTS).subscription!;
    const result = applyBillingEvent(
      { ...trial, ...active },
      event('trial.ended', { occurredAt: at(5) }),
      OPTS,
    );
    expect(result.subscription).toBeNull();
  });

  it('evento mais antigo que o ultimo aplicado nao muda o status, mas a cobranca entra', () => {
    const active = applyBillingEvent(
      trial,
      event('payment.succeeded', { occurredAt: at(10) }),
      OPTS,
    ).subscription!;
    const late = applyBillingEvent(
      { ...trial, ...active },
      event('payment.failed', {
        occurredAt: at(5),
        invoice: { id: 'in_0', amountCents: 2990, currency: 'BRL' },
      }),
      OPTS,
    );
    expect(late.subscription).toBeNull();
    expect(late.invoice).toMatchObject({ providerInvoiceId: 'in_0', status: 'FAILED' });
  });

  it('evento desconhecido nao muda nada', () => {
    expect(applyBillingEvent(trial, event(null), OPTS)).toEqual({
      subscription: null,
      invoice: null,
    });
  });

  it('cobranca sem plano (nem no evento nem na assinatura) fica fora do historico', () => {
    const result = applyBillingEvent(trial, event('payment.succeeded', { plan: null }), OPTS);
    expect(result.subscription).toMatchObject({ status: 'ACTIVE' });
    expect(result.invoice).toBeNull();
  });
});
