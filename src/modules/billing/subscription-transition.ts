import {
  InvoiceStatus,
  SubscriptionStatus,
  type SubscriptionPlan,
} from '../../generated/prisma/enums';
import type { NormalizedBillingEvent } from './billing-provider';

// Como cada evento do gateway muda a Subscription (funcao pura; o webhook grava o resultado).

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CurrentSubscription {
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  paymentMethodLabel: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  graceUntil: Date | null;
  paymentFailedAt: Date | null;
  lastEventAt: Date | null;
}

export interface SubscriptionWrite {
  provider: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  paymentMethodLabel: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  graceUntil: Date | null;
  paymentFailedAt: Date | null;
  lastEventAt: Date;
}

export interface InvoiceWrite {
  providerInvoiceId: string;
  plan: SubscriptionPlan;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  paymentMethodLabel: string | null;
  paidAt: Date | null;
}

export interface TransitionResult {
  // null: o status nao muda (evento sem efeito ou mais antigo que o ultimo aplicado).
  subscription: SubscriptionWrite | null;
  // A cobranca entra no historico mesmo quando o evento chega atrasado.
  invoice: InvoiceWrite | null;
}

export interface TransitionOptions {
  providerName: string;
  graceDays: number;
}

export function applyBillingEvent(
  current: CurrentSubscription | null,
  event: NormalizedBillingEvent,
  { providerName, graceDays }: TransitionOptions,
): TransitionResult {
  const invoice = invoiceFor(current, event);
  if (!event.type) return { subscription: null, invoice: null };

  // Gateways nao garantem a ordem de entrega: um evento mais antigo que o ultimo aplicado
  // nao volta o status (ex.: "recusado" atrasado depois de "aprovado").
  if (current?.lastEventAt && event.occurredAt.getTime() < current.lastEventAt.getTime()) {
    return { subscription: null, invoice };
  }

  // Base: o que ja existe, com os dados do gateway que vieram no evento por cima.
  const base: SubscriptionWrite = {
    provider: providerName,
    status: current?.status ?? SubscriptionStatus.EXPIRED,
    plan: event.plan ?? current?.plan ?? null,
    trialEndsAt: current?.trialEndsAt ?? null,
    currentPeriodEnd: event.currentPeriodEnd ?? current?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: false,
    paymentMethodLabel: event.paymentMethodLabel ?? current?.paymentMethodLabel ?? null,
    providerCustomerId: event.customerId ?? current?.providerCustomerId ?? null,
    providerSubscriptionId: event.subscriptionId ?? current?.providerSubscriptionId ?? null,
    graceUntil: current?.graceUntil ?? null,
    paymentFailedAt: current?.paymentFailedAt ?? null,
    lastEventAt: event.occurredAt,
  };

  switch (event.type) {
    case 'payment.succeeded':
      return {
        subscription: {
          ...base,
          status: SubscriptionStatus.ACTIVE,
          graceUntil: null,
          paymentFailedAt: null,
        },
        invoice,
      };

    case 'payment.failed': {
      // So a primeira recusa abre o prazo; novas tentativas recusadas nao o estendem.
      const alreadyPastDue =
        current?.status === SubscriptionStatus.PAST_DUE && current.graceUntil !== null;
      return {
        subscription: {
          ...base,
          status: SubscriptionStatus.PAST_DUE,
          paymentFailedAt: alreadyPastDue ? base.paymentFailedAt : event.occurredAt,
          graceUntil: alreadyPastDue
            ? base.graceUntil
            : new Date(event.occurredAt.getTime() + graceDays * MS_PER_DAY),
        },
        invoice,
      };
    }

    case 'subscription.canceled':
      return {
        subscription: {
          ...base,
          status: SubscriptionStatus.CANCELED,
          cancelAtPeriodEnd: true,
          graceUntil: null,
        },
        invoice,
      };

    case 'trial.ended':
      // Quem assinou durante o teste nao perde nada.
      if (current && current.status !== SubscriptionStatus.TRIALING) {
        return { subscription: null, invoice };
      }
      return {
        subscription: {
          ...base,
          status: SubscriptionStatus.EXPIRED,
          trialEndsAt: event.occurredAt,
        },
        invoice,
      };
  }
}

function invoiceFor(
  current: CurrentSubscription | null,
  event: NormalizedBillingEvent,
): InvoiceWrite | null {
  if (event.type !== 'payment.succeeded' && event.type !== 'payment.failed') return null;
  const plan = event.plan ?? current?.plan ?? null;
  if (!event.invoice || !plan) return null;
  const paid = event.type === 'payment.succeeded';
  return {
    providerInvoiceId: event.invoice.id,
    plan,
    amountCents: event.invoice.amountCents,
    currency: event.invoice.currency,
    status: paid ? InvoiceStatus.PAID : InvoiceStatus.FAILED,
    paymentMethodLabel: event.paymentMethodLabel ?? current?.paymentMethodLabel ?? null,
    paidAt: paid ? event.occurredAt : null,
  };
}
