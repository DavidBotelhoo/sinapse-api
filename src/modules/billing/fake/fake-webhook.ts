import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { SubscriptionPlan } from '../../../generated/prisma/enums';
import {
  BILLING_EVENT_TYPES,
  InvalidWebhookSignatureError,
  type BillingEventType,
  type NormalizedBillingEvent,
} from '../billing-provider';

// Formato e assinatura dos webhooks do provedor de teste. Usado pelo FakeBillingProvider
// (para conferir), pelo comando pnpm billing:simulate e pelos e2e (para gerar).
//
// Cabecalho: X-Sinapse-Signature: t=<unix segundos>,v1=<hex HMAC-SHA256 de "t.corpo">

export const FAKE_PROVIDER_NAME = 'fake';
export const FAKE_SIGNATURE_HEADER = 'x-sinapse-signature';
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

export const fakeEventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  createdAt: isoDate,
  data: z.object({
    userId: z.uuid(),
    customerId: z.string().min(1).max(200).nullish(),
    subscriptionId: z.string().min(1).max(200).nullish(),
    plan: z.enum(SubscriptionPlan).nullish(),
    currentPeriodEnd: isoDate.nullish(),
    paymentMethodLabel: z.string().min(1).max(80).nullish(),
    invoice: z
      .object({
        id: z.string().min(1).max(200),
        amountCents: z.number().int().nonnegative(),
        currency: z.string().length(3).default('BRL'),
      })
      .nullish(),
  }),
});

export type FakeEventInput = z.input<typeof fakeEventSchema>;

export function signFakePayload(rawBody: string, secret: string, timestamp: number): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

export function verifyFakeSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string,
  nowSeconds: number,
): void {
  if (!header) throw new InvalidWebhookSignatureError('cabecalho ausente');
  const parts = new Map(
    header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key ?? '', rest.join('=')] as const;
    }),
  );
  const t = Number(parts.get('t'));
  const v1 = parts.get('v1') ?? '';
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(v1)) {
    throw new InvalidWebhookSignatureError('cabecalho malformado');
  }
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) {
    throw new InvalidWebhookSignatureError('carimbo de tempo fora da tolerancia');
  }
  const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  if (!timingSafeEqual(expected, Buffer.from(v1, 'hex'))) {
    throw new InvalidWebhookSignatureError('assinatura nao confere');
  }
}

const KNOWN_TYPES = new Set<string>(BILLING_EVENT_TYPES);

export function parseFakeEvent(rawBody: Buffer): NormalizedBillingEvent {
  let json: unknown;
  try {
    json = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new InvalidWebhookSignatureError('corpo nao e JSON');
  }
  const parsed = fakeEventSchema.safeParse(json);
  if (!parsed.success) throw new InvalidWebhookSignatureError('corpo fora do formato');
  const { id, type, createdAt, data } = parsed.data;
  return {
    eventId: id,
    rawType: type,
    type: KNOWN_TYPES.has(type) ? (type as BillingEventType) : null,
    occurredAt: createdAt,
    userId: data.userId,
    customerId: data.customerId ?? null,
    subscriptionId: data.subscriptionId ?? null,
    plan: data.plan ?? null,
    currentPeriodEnd: data.currentPeriodEnd ?? null,
    paymentMethodLabel: data.paymentMethodLabel ?? null,
    invoice: data.invoice ?? null,
    payload: json,
  };
}
