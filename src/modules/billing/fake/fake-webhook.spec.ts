import { InvalidWebhookSignatureError } from '../billing-provider';
import { parseFakeEvent, signFakePayload, verifyFakeSignature } from './fake-webhook';

const SECRET = 'a'.repeat(64);
const NOW = 1_795_000_000;
const USER = '0b6f7d2e-3c1a-4f5e-9a8b-1c2d3e4f5a6b';

const body = JSON.stringify({
  id: 'evt_1',
  type: 'payment.succeeded',
  createdAt: '2026-11-21T12:00:00.000Z',
  data: {
    userId: USER,
    customerId: 'cus_1',
    subscriptionId: 'sub_1',
    plan: 'MONTHLY',
    currentPeriodEnd: '2026-12-21T12:00:00.000Z',
    paymentMethodLabel: 'Visa final 4242',
    invoice: { id: 'in_1', amountCents: 2990 },
  },
});

const verify = (raw: string, header: string | undefined, now = NOW): void =>
  verifyFakeSignature(Buffer.from(raw), header, SECRET, now);

describe('webhook do provedor de teste: assinatura', () => {
  it('aceita a assinatura certa', () => {
    expect(() => verify(body, signFakePayload(body, SECRET, NOW))).not.toThrow();
  });

  it('aceita ate 5 minutos de diferenca no relogio', () => {
    expect(() => verify(body, signFakePayload(body, SECRET, NOW - 300))).not.toThrow();
    expect(() => verify(body, signFakePayload(body, SECRET, NOW + 300))).not.toThrow();
  });

  it.each([
    ['sem cabecalho', undefined],
    ['cabecalho malformado', 'lixo'],
    ['hex curto', `t=${NOW},v1=abc`],
    ['segredo errado', signFakePayload(body, 'b'.repeat(64), NOW)],
    ['carimbo velho (reenvio)', signFakePayload(body, SECRET, NOW - 301)],
  ])('recusa %s', (_label, header) => {
    expect(() => verify(body, header)).toThrow(InvalidWebhookSignatureError);
  });

  it('recusa corpo alterado depois de assinado', () => {
    const header = signFakePayload(body, SECRET, NOW);
    const tampered = body.replace('2990', '1');
    expect(() => verify(tampered, header)).toThrow(InvalidWebhookSignatureError);
  });

  it('recusa assinatura de outro carimbo (troca o t do cabecalho)', () => {
    const header = signFakePayload(body, SECRET, NOW).replace(`t=${NOW}`, `t=${NOW - 10}`);
    expect(() => verify(body, header)).toThrow(InvalidWebhookSignatureError);
  });
});

describe('webhook do provedor de teste: formato', () => {
  it('traduz o evento para o formato do Sinapse', () => {
    expect(parseFakeEvent(Buffer.from(body))).toEqual({
      eventId: 'evt_1',
      rawType: 'payment.succeeded',
      type: 'payment.succeeded',
      occurredAt: new Date('2026-11-21T12:00:00.000Z'),
      userId: USER,
      customerId: 'cus_1',
      subscriptionId: 'sub_1',
      plan: 'MONTHLY',
      currentPeriodEnd: new Date('2026-12-21T12:00:00.000Z'),
      paymentMethodLabel: 'Visa final 4242',
      invoice: { id: 'in_1', amountCents: 2990, currency: 'BRL' },
      payload: JSON.parse(body),
    });
  });

  it('tipo desconhecido fica registrado, mas sem efeito (type null)', () => {
    const other = body.replace('payment.succeeded', 'customer.updated');
    expect(parseFakeEvent(Buffer.from(other))).toMatchObject({
      rawType: 'customer.updated',
      type: null,
    });
  });

  it.each([
    ['corpo que nao e JSON', '{'],
    ['userId que nao e uuid', body.replace(USER, 'abc')],
    ['plano inexistente', body.replace('"MONTHLY"', '"WEEKLY"')],
    ['valor negativo', body.replace('2990', '-1')],
  ])('recusa %s', (_label, raw) => {
    expect(() => parseFakeEvent(Buffer.from(raw))).toThrow(InvalidWebhookSignatureError);
  });
});
