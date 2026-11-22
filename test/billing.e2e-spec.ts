import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createValidationPipe } from '../src/common/validation/validation-pipe.factory';
import type { Env } from '../src/config/env';
import { ImportStatus, UserRole } from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/modules/mail/mail.service';
import type { BillingEventType } from '../src/modules/billing/billing-provider';
import {
  FAKE_SIGNATURE_HEADER,
  signFakePayload,
  type FakeEventInput,
} from '../src/modules/billing/fake/fake-webhook';

const ORIGIN = 'http://localhost:3000';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type Agent = ReturnType<typeof request.agent>;
type EventData = Omit<FakeEventInput['data'], 'userId'>;

// Mudancas de status da assinatura: teste gratis no cadastro, webhook assinado e idempotente,
// guard de estudo e importacao (conta so leitura sem acesso) e acesso vitalicio por papel.
describe('Assinatura e cobrancas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let secret: string;
  let prices: { monthly: number; yearly: number };

  const suffix = Date.now().toString(36);
  const password = 'senha-super-forte';
  const emails = {
    ana: `e2e-billing-ana-${suffix}@test.sinapse.local`,
    bia: `e2e-billing-bia-${suffix}@test.sinapse.local`,
  };
  const ids = { ana: '', bia: '' };
  let ana: Agent;
  let bia: Agent;
  let deckId = '';

  // Eventos em ordem: T(1) acontece depois de T(0), e assim por diante.
  const base = Date.now() - 60 * 60_000;
  const T = (minute: number): Date => new Date(base + minute * 60_000);
  let eventSeq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({ enqueuePasswordReset: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    app.setGlobalPrefix('v1');
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const config = app.get<ConfigService<Env, true>>(ConfigService);
    secret = config.get('BILLING_WEBHOOK_SECRET', { infer: true });
    prices = {
      monthly: config.get('BILLING_PRICE_MONTHLY_CENTS', { infer: true }),
      yearly: config.get('BILLING_PRICE_YEARLY_CENTS', { infer: true }),
    };

    ana = request.agent(app.getHttpServer());
    bia = request.agent(app.getHttpServer());
    ids.ana = await register(ana, emails.ana, 'Ana');
    ids.bia = await register(bia, emails.bia, 'Bia');
  });

  afterAll(async () => {
    const userIds = Object.values(ids).filter((id) => id.length > 0);
    await prisma.billingEvent.deleteMany({
      where: { providerEventId: { startsWith: `evt_e2e_${suffix}_` } },
    });
    await prisma.deck.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.importJob.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function register(agent: Agent, email: string, firstName: string): Promise<string> {
    const res = await agent
      .post('/v1/auth/register')
      .set('Origin', ORIGIN)
      .send({ firstName, lastName: 'E2E', email, password });
    expect(res.status).toBe(201);
    return (res.body as { id: string }).id;
  }

  function buildEvent(
    userId: string,
    type: string, // aceita tipos que o Sinapse nao conhece (ex.: customer.updated)
    occurredAt: Date,
    data: EventData = {},
    id = `evt_e2e_${suffix}_${++eventSeq}`,
  ): string {
    const event: FakeEventInput = {
      id,
      type,
      createdAt: occurredAt.toISOString(),
      data: { userId, ...data },
    };
    return JSON.stringify(event);
  }

  function post(body: string, signature?: string): Promise<request.Response> {
    const req = request(app.getHttpServer())
      .post('/v1/webhooks/billing')
      .set('Content-Type', 'application/json');
    if (signature !== undefined) req.set(FAKE_SIGNATURE_HEADER, signature);
    return req.send(body);
  }

  const sign = (body: string): string =>
    signFakePayload(body, secret, Math.floor(Date.now() / 1000));

  async function send(
    userId: string,
    type: BillingEventType,
    occurredAt: Date,
    data: EventData = {},
  ): Promise<request.Response> {
    const body = buildEvent(userId, type, occurredAt, data);
    const res = await post(body, sign(body));
    expect(res.status).toBe(200);
    return res;
  }

  const paid = (invoiceId: string, plan: 'MONTHLY' | 'YEARLY' = 'MONTHLY'): EventData => ({
    customerId: `cus_e2e_${suffix}`,
    subscriptionId: `sub_e2e_${suffix}`,
    plan,
    currentPeriodEnd: new Date(Date.now() + 30 * MS_PER_DAY).toISOString(),
    paymentMethodLabel: 'Visa final 4417',
    invoice: { id: `in_e2e_${suffix}_${invoiceId}`, amountCents: prices.monthly },
  });

  async function subscriptionOf(agent: Agent): Promise<Record<string, unknown>> {
    const res = await agent.get('/v1/billing/subscription');
    expect(res.status).toBe(200);
    return res.body as Record<string, unknown>;
  }

  // Com acesso, a Revisao de hoje sem nada vencido responde 422; sem acesso, 403.
  async function studyStatus(agent: Agent): Promise<number> {
    const res = await agent
      .post('/v1/study/sessions')
      .set('Origin', ORIGIN)
      .send({ mode: 'today' });
    if (res.status === 403) expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    return res.status;
  }

  it('cadastro entra no teste gratis de 7 dias, com acesso', async () => {
    const me = await ana.get('/v1/me');
    expect(me.body.role).toBe('USER');
    expect(me.body.subscription).toMatchObject({
      status: 'TRIALING',
      hasAccess: true,
      lifetime: false,
      plan: null,
      graceUntil: null,
    });
    const days = (Date.parse(me.body.subscription.trialEndsAt as string) - Date.now()) / MS_PER_DAY;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
    expect(await subscriptionOf(ana)).toEqual(me.body.subscription);

    // Com acesso: cria deck (importacao) e estuda.
    const job = await prisma.importJob.create({
      data: {
        userId: ids.ana,
        fileKey: `imports/e2e-billing-${suffix}.pdf`,
        fileName: 'deck.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        status: ImportStatus.READY,
        pairs: [{ question: 'Q1', answer: 'R1' }],
        pairsFound: 1,
        pairsMissingAnswer: 0,
      },
    });
    const anatomia = await prisma.subject.findFirstOrThrow({ where: { slug: 'anatomia' } });
    const deck = await ana
      .post('/v1/decks')
      .set('Origin', ORIGIN)
      .send({
        importId: job.id,
        name: 'Deck',
        year: 1,
        subjectIds: [anatomia.id],
        visibility: 'PRIVATE',
      });
    expect(deck.status).toBe(201);
    deckId = deck.body.id as string;
    expect(await studyStatus(ana)).toBe(422);
  });

  it('planos publicos com os precos da configuracao', async () => {
    const res = await request(app.getHttpServer()).get('/v1/billing/plans');
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('BRL');
    expect(res.body.trialDays).toBe(7);
    expect(res.body.plans).toEqual([
      expect.objectContaining({ plan: 'MONTHLY', interval: 'MONTH', priceCents: prices.monthly }),
      expect.objectContaining({
        plan: 'YEARLY',
        interval: 'YEAR',
        priceCents: prices.yearly,
        monthlyEquivalentCents: Math.round(prices.yearly / 12),
      }),
    ]);
  });

  it('checkout e portal no teste gratis', async () => {
    const checkout = await ana
      .post('/v1/billing/checkout')
      .set('Origin', ORIGIN)
      .send({ plan: 'MONTHLY' });
    expect(checkout.status).toBe(200);
    expect(checkout.body.url).toContain('/perfil/assinatura');
    expect(checkout.body.url).toContain('plano=MONTHLY');

    const badPlan = await ana
      .post('/v1/billing/checkout')
      .set('Origin', ORIGIN)
      .send({ plan: 'WEEKLY' });
    expect(badPlan.status).toBe(400);
    expect(badPlan.body.error.fields.plan).toBe('Escolha o plano mensal ou anual.');

    const portal = await ana.post('/v1/billing/portal').set('Origin', ORIGIN);
    expect(portal.status).toBe(409);
    expect(portal.body.error.code).toBe('NO_PAID_SUBSCRIPTION');
  });

  it('webhook: recusa assinatura ausente, errada ou corpo alterado', async () => {
    const body = buildEvent(ids.ana, 'trial.ended', T(0));
    for (const res of [
      await post(body),
      await post(body, 'lixo'),
      await post(body, signFakePayload(body, 'x'.repeat(64), Math.floor(Date.now() / 1000))),
      await post(body.replace('trial.ended', 'payment.succeeded'), sign(body)),
      await post(body, signFakePayload(body, secret, Math.floor(Date.now() / 1000) - 600)),
    ]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    }
    expect(
      await prisma.billingEvent.count({
        where: { providerEventId: { startsWith: `evt_e2e_${suffix}_` } },
      }),
    ).toBe(0);
    expect((await subscriptionOf(ana)).status).toBe('TRIALING');
  });

  it('teste terminado: so leitura (ve os decks, nao estuda nem importa)', async () => {
    await send(ids.ana, 'trial.ended', T(0));
    expect(await subscriptionOf(ana)).toMatchObject({ status: 'EXPIRED', hasAccess: false });

    expect(await studyStatus(ana)).toBe(403);
    const upload = await ana.post('/v1/imports').set('Origin', ORIGIN);
    expect(upload.status).toBe(403);
    const createDeck = await ana
      .post('/v1/decks')
      .set('Origin', ORIGIN)
      .send({ importId: deckId, name: 'x', year: 1, subjectIds: [deckId], visibility: 'PRIVATE' });
    expect(createDeck.status).toBe(403);
    const appendImport = await ana
      .post(`/v1/decks/${deckId}/imports`)
      .set('Origin', ORIGIN)
      .send({ importId: deckId });
    expect(appendImport.status).toBe(403);

    expect((await ana.get('/v1/decks')).status).toBe(200);
    expect((await ana.get(`/v1/decks/${deckId}`)).status).toBe(200);
    expect((await ana.get(`/v1/decks/${deckId}/cards`)).status).toBe(200);
    expect((await ana.get('/v1/study/overview')).status).toBe(200);
    expect((await ana.get('/v1/me/stats')).status).toBe(200);
  });

  it('pagamento aprovado: ativa, historico e evento repetido nao duplica', async () => {
    const body = buildEvent(ids.ana, 'payment.succeeded', T(1), paid('1'));
    const first = await post(body, sign(body));
    expect(first.body).toEqual({ received: true, duplicate: false });
    const again = await post(body, sign(body));
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ received: true, duplicate: true });

    expect(await subscriptionOf(ana)).toMatchObject({
      status: 'ACTIVE',
      hasAccess: true,
      plan: 'MONTHLY',
      paymentMethodLabel: 'Visa final 4417',
      graceUntil: null,
      cancelAtPeriodEnd: false,
    });
    expect(await studyStatus(ana)).toBe(422);

    const invoices = await ana.get('/v1/billing/invoices');
    expect(invoices.status).toBe(200);
    expect(invoices.body.items).toEqual([
      {
        id: expect.any(String),
        date: T(1).toISOString(),
        plan: 'MONTHLY',
        amountCents: prices.monthly,
        currency: 'BRL',
        status: 'PAID',
        paymentMethodLabel: 'Visa final 4417',
      },
    ]);
    expect(invoices.body.nextCursor).toBeNull();

    // Ja assina o mensal: checkout do mesmo plano e recusado; trocar para o anual pode.
    const same = await ana
      .post('/v1/billing/checkout')
      .set('Origin', ORIGIN)
      .send({ plan: 'MONTHLY' });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe('SUBSCRIPTION_ALREADY_ACTIVE');
    const yearly = await ana
      .post('/v1/billing/checkout')
      .set('Origin', ORIGIN)
      .send({ plan: 'YEARLY' });
    expect(yearly.status).toBe(200);
    const portal = await ana.post('/v1/billing/portal').set('Origin', ORIGIN);
    expect(portal.status).toBe(200);
    expect(portal.body.url).toContain('portal=teste');
  });

  it('o mesmo evento chegando duas vezes ao mesmo tempo: processa uma so', async () => {
    const body = buildEvent(ids.ana, 'payment.succeeded', T(2), paid('2'));
    const [a, b] = await Promise.all([post(body, sign(body)), post(body, sign(body))]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.duplicate, b.body.duplicate].sort()).toEqual([false, true]);
    expect(await prisma.invoice.count({ where: { providerInvoiceId: `in_e2e_${suffix}_2` } })).toBe(
      1,
    );
  });

  it('pagamento recusado: acesso ate o prazo, depois so leitura; aprovado depois limpa', async () => {
    await send(ids.ana, 'payment.failed', T(3), { ...paid('3'), currentPeriodEnd: null });
    const failed = await subscriptionOf(ana);
    expect(failed).toMatchObject({
      status: 'PAST_DUE',
      hasAccess: true,
      paymentFailedAt: T(3).toISOString(),
      graceUntil: new Date(T(3).getTime() + 5 * MS_PER_DAY).toISOString(),
    });
    expect(await studyStatus(ana)).toBe(422);

    // Evento atrasado (aprovado de antes da recusa) nao volta o status, mas entra no historico.
    await send(ids.ana, 'payment.succeeded', T(2.5), paid('2b'));
    expect((await subscriptionOf(ana)).status).toBe('PAST_DUE');

    const history = await ana.get('/v1/billing/invoices');
    expect((history.body.items as Array<{ status: string }>).map((i) => i.status)).toEqual([
      'FAILED',
      'PAID',
      'PAID',
      'PAID',
    ]);

    // O prazo passou sem pagamento: so leitura.
    await prisma.subscription.update({
      where: { userId: ids.ana },
      data: { graceUntil: new Date(Date.now() - 1000) },
    });
    expect(await subscriptionOf(ana)).toMatchObject({ status: 'EXPIRED', hasAccess: false });
    expect(await studyStatus(ana)).toBe(403);

    // Pagou a mesma cobranca: ativa de novo e a cobranca recusada vira paga.
    await send(ids.ana, 'payment.succeeded', T(4), paid('3'));
    expect(await subscriptionOf(ana)).toMatchObject({
      status: 'ACTIVE',
      graceUntil: null,
      paymentFailedAt: null,
    });
    const invoice3 = await prisma.invoice.findUniqueOrThrow({
      where: { providerInvoiceId: `in_e2e_${suffix}_3` },
    });
    expect(invoice3.status).toBe('PAID');
    expect(await studyStatus(ana)).toBe(422);
  });

  it('paginacao do historico', async () => {
    const first = await ana.get('/v1/billing/invoices?limit=2');
    expect(first.body.items).toHaveLength(2);
    const second = await ana.get(
      `/v1/billing/invoices?limit=2&cursor=${encodeURIComponent(first.body.nextCursor as string)}`,
    );
    expect(second.body.items).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
    const seen = [...first.body.items, ...second.body.items].map((i: { id: string }) => i.id);
    expect(new Set(seen).size).toBe(4);
    expect((await ana.get('/v1/billing/invoices?cursor=lixo')).status).toBe(400);
  });

  it('cancelada: acesso ate o fim do periodo pago, depois so leitura', async () => {
    await send(ids.ana, 'subscription.canceled', T(5), { currentPeriodEnd: null });
    expect(await subscriptionOf(ana)).toMatchObject({
      status: 'CANCELED',
      hasAccess: true,
      cancelAtPeriodEnd: true,
    });
    expect(await studyStatus(ana)).toBe(422);

    await prisma.subscription.update({
      where: { userId: ids.ana },
      data: { currentPeriodEnd: new Date(Date.now() - 1000) },
    });
    expect(await subscriptionOf(ana)).toMatchObject({ status: 'EXPIRED', hasAccess: false });
    expect(await studyStatus(ana)).toBe(403);
  });

  it('teste vencido pela data, sem evento nenhum, tambem vira so leitura', async () => {
    await prisma.subscription.update({
      where: { userId: ids.bia },
      data: { trialEndsAt: new Date(Date.now() - 1000) },
    });
    expect(await subscriptionOf(bia)).toMatchObject({ status: 'EXPIRED', hasAccess: false });
    expect(await studyStatus(bia)).toBe(403);
  });

  it.each([UserRole.ADMIN, UserRole.SUPER_ADMIN])('%s: acesso vitalicio', async (role) => {
    await prisma.user.update({ where: { id: ids.bia }, data: { role } });
    const me = await bia.get('/v1/me');
    expect(me.body.role).toBe(role);
    expect(me.body.subscription).toMatchObject({
      status: 'ACTIVE',
      hasAccess: true,
      lifetime: true,
      accessUntil: null,
      trialEndsAt: null,
    });
    expect(await studyStatus(bia)).toBe(422);
    const checkout = await bia
      .post('/v1/billing/checkout')
      .set('Origin', ORIGIN)
      .send({ plan: 'YEARLY' });
    expect(checkout.status).toBe(409);
    expect(checkout.body.error.code).toBe('SUBSCRIPTION_ALREADY_ACTIVE');
  });

  it('evento de usuario que nao existe ou de tipo desconhecido: registrado, sem efeito', async () => {
    const ghost = await send(
      '00000000-0000-4000-8000-000000000000',
      'payment.succeeded',
      T(6),
      paid('ghost'),
    );
    expect(ghost.body.duplicate).toBe(false);
    const other = buildEvent(ids.ana, 'customer.updated', T(7));
    const res = await post(other, sign(other));
    expect(res.status).toBe(200);
    expect((await subscriptionOf(ana)).status).toBe('EXPIRED');
  });

  it('sem login: 401 nas rotas de billing (o webhook nao usa login)', async () => {
    const anon = request(app.getHttpServer());
    expect((await anon.get('/v1/billing/subscription')).status).toBe(401);
    expect((await anon.get('/v1/billing/invoices')).status).toBe(401);
    expect(
      (await anon.post('/v1/billing/checkout').set('Origin', ORIGIN).send({ plan: 'MONTHLY' }))
        .status,
    ).toBe(401);
    expect((await anon.post('/v1/billing/portal').set('Origin', ORIGIN)).status).toBe(401);
  });
});
