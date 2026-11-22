import type { SubscriptionPlan } from '../../generated/prisma/enums';

// Evento do gateway ja traduzido para o formato do Sinapse. Cada provedor converte o seu.
export const BILLING_EVENT_TYPES = [
  'payment.succeeded', // pagamento aprovado (primeira cobranca ou renovacao)
  'payment.failed', // pagamento recusado
  'subscription.canceled', // cancelada; acesso ate o fim do periodo pago
  'trial.ended', // teste gratis terminou sem assinatura
] as const;

export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

export interface BillingEventInvoice {
  id: string;
  amountCents: number;
  currency: string;
}

export interface NormalizedBillingEvent {
  eventId: string;
  // Tipo como veio do gateway (gravado no BillingEvent) e o tipo que o Sinapse entende
  // (null: evento que nao muda nada aqui, so fica registrado).
  rawType: string;
  type: BillingEventType | null;
  occurredAt: Date;
  userId: string;
  customerId: string | null;
  subscriptionId: string | null;
  plan: SubscriptionPlan | null;
  currentPeriodEnd: Date | null;
  paymentMethodLabel: string | null;
  invoice: BillingEventInvoice | null;
  payload: unknown;
}

export interface CheckoutInput {
  userId: string;
  email: string;
  plan: SubscriptionPlan;
  priceCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
}

export interface PortalInput {
  userId: string;
  customerId: string;
  returnUrl: string;
}

export class InvalidWebhookSignatureError extends Error {
  constructor(reason: string) {
    super(`Assinatura do webhook invalida: ${reason}`);
  }
}

// Gateway de pagamento. Escolhido por BILLING_PROVIDER (decisao em aberto 5); por enquanto
// so existe o FakeBillingProvider.
export abstract class BillingProvider {
  abstract readonly name: string;
  abstract createCheckout(input: CheckoutInput): Promise<{ url: string }>;
  abstract createPortal(input: PortalInput): Promise<{ url: string }>;
  // Confere a assinatura com o corpo cru e traduz o evento. Assinatura ruim ou corpo fora
  // do formato: InvalidWebhookSignatureError.
  abstract parseWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): NormalizedBillingEvent;
}
