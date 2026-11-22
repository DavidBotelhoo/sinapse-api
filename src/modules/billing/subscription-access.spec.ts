import { SubscriptionStatus, UserRole } from '../../generated/prisma/enums';
import { subscriptionAccess, type SubscriptionDates } from './subscription-access';

const NOW = new Date('2026-11-21T12:00:00.000Z');
const BEFORE = new Date(NOW.getTime() - 1);
const AFTER = new Date(NOW.getTime() + 1);

const sub = (patch: Partial<SubscriptionDates>): SubscriptionDates => ({
  status: SubscriptionStatus.TRIALING,
  trialEndsAt: null,
  currentPeriodEnd: null,
  graceUntil: null,
  ...patch,
});

describe('subscriptionAccess', () => {
  it('sem assinatura: NONE e sem acesso', () => {
    expect(subscriptionAccess(UserRole.USER, null, NOW)).toEqual({
      status: 'NONE',
      hasAccess: false,
      lifetime: false,
      accessUntil: null,
    });
  });

  it.each([UserRole.ADMIN, UserRole.SUPER_ADMIN])(
    '%s: vitalicio, mesmo sem assinatura ou vencida',
    (role) => {
      const lifetime = { status: 'ACTIVE', hasAccess: true, lifetime: true, accessUntil: null };
      expect(subscriptionAccess(role, null, NOW)).toEqual(lifetime);
      expect(subscriptionAccess(role, sub({ status: SubscriptionStatus.EXPIRED }), NOW)).toEqual(
        lifetime,
      );
    },
  );

  describe('teste gratis', () => {
    it('vale ate trialEndsAt', () => {
      expect(subscriptionAccess(UserRole.USER, sub({ trialEndsAt: AFTER }), NOW)).toEqual({
        status: 'TRIALING',
        hasAccess: true,
        lifetime: false,
        accessUntil: AFTER,
      });
    });

    it.each([
      ['no instante exato do fim', NOW],
      ['depois do fim', BEFORE],
      ['sem data de fim', null],
    ])('vira EXPIRED %s', (_label, trialEndsAt) => {
      expect(subscriptionAccess(UserRole.USER, sub({ trialEndsAt }), NOW)).toMatchObject({
        status: 'EXPIRED',
        hasAccess: false,
      });
    });
  });

  it('ativa: acesso, ate o fim do periodo pago (ou sem data)', () => {
    const active = sub({ status: SubscriptionStatus.ACTIVE, currentPeriodEnd: AFTER });
    expect(subscriptionAccess(UserRole.USER, active, NOW)).toMatchObject({
      status: 'ACTIVE',
      hasAccess: true,
      accessUntil: AFTER,
    });
    // O status vem do webhook: sem evento de falha, a renovacao atrasada nao corta o acesso.
    const late = sub({ status: SubscriptionStatus.ACTIVE, currentPeriodEnd: BEFORE });
    expect(subscriptionAccess(UserRole.USER, late, NOW).hasAccess).toBe(true);
  });

  it('pagamento recusado: acesso ate graceUntil, depois EXPIRED', () => {
    const open = sub({ status: SubscriptionStatus.PAST_DUE, graceUntil: AFTER });
    expect(subscriptionAccess(UserRole.USER, open, NOW)).toMatchObject({
      status: 'PAST_DUE',
      hasAccess: true,
      accessUntil: AFTER,
    });
    const over = sub({ status: SubscriptionStatus.PAST_DUE, graceUntil: NOW });
    expect(subscriptionAccess(UserRole.USER, over, NOW)).toMatchObject({
      status: 'EXPIRED',
      hasAccess: false,
    });
  });

  it('cancelada: acesso ate o fim do periodo pago, depois EXPIRED', () => {
    const paid = sub({ status: SubscriptionStatus.CANCELED, currentPeriodEnd: AFTER });
    expect(subscriptionAccess(UserRole.USER, paid, NOW)).toMatchObject({
      status: 'CANCELED',
      hasAccess: true,
      accessUntil: AFTER,
    });
    const ended = sub({ status: SubscriptionStatus.CANCELED, currentPeriodEnd: BEFORE });
    expect(subscriptionAccess(UserRole.USER, ended, NOW)).toMatchObject({
      status: 'EXPIRED',
      hasAccess: false,
    });
  });

  it('expirada: sem acesso', () => {
    const expired = sub({ status: SubscriptionStatus.EXPIRED, currentPeriodEnd: AFTER });
    expect(subscriptionAccess(UserRole.USER, expired, NOW)).toMatchObject({
      status: 'EXPIRED',
      hasAccess: false,
    });
  });
});
