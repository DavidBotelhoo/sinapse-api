import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createValidationPipe } from '../src/common/validation/validation-pipe.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/modules/mail/mail.service';
import { CardLearningState, ImportStatus } from '../src/generated/prisma/enums';

const ORIGIN = 'http://localhost:3000';

type Agent = ReturnType<typeof request.agent>;

describe('Estudo: sessao inteira + estatisticas e agenda (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now().toString(36);
  const emailA = `e2e-study-a-${suffix}@test.sinapse.local`;
  const emailB = `e2e-study-b-${suffix}@test.sinapse.local`;
  const password = 'senha-super-forte';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({ enqueuePasswordReset: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('v1');
    app.use(cookieParser());
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: [emailA, emailB] } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    // Deck primeiro (cascata em cards, CardState e ReviewLog); o usuario leva as sessoes.
    await prisma.deck.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.importJob.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  async function register(agent: Agent, email: string, firstName: string): Promise<string> {
    const res = await agent
      .post('/v1/auth/register')
      .set('Origin', ORIGIN)
      .send({ firstName, lastName: 'E2E', email, password });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    return user.id;
  }

  it('overview -> sessao -> avaliacoes -> resumo -> estudar novamente -> stats -> agenda', async () => {
    const a = request.agent(app.getHttpServer());
    const b = request.agent(app.getHttpServer());
    const userA = await register(a, emailA, 'Ana');
    await register(b, emailB, 'Bruno');

    // --- Deck com 4 cards (importacao pronta como fixture) ---
    const anatomia = await prisma.subject.findFirstOrThrow({
      where: { slug: 'anatomia' },
      select: { id: true, name: true },
    });
    const importJob = await prisma.importJob.create({
      data: {
        userId: userA,
        fileKey: `imports/e2e-study-${suffix}.pdf`,
        fileName: 'anatomia.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        status: ImportStatus.READY,
        pairs: [
          { question: 'Q1', answer: 'R1' },
          { question: 'Q2', answer: 'R2' },
          { question: 'Q3', answer: 'R3' },
          { question: 'Q4', answer: 'R4' },
        ],
        pairsFound: 4,
        pairsMissingAnswer: 0,
      },
    });
    const deckRes = await a
      .post('/v1/decks')
      .set('Origin', ORIGIN)
      .send({
        importId: importJob.id,
        name: 'Membro superior',
        year: 1,
        subjectIds: [anatomia.id],
        visibility: 'PRIVATE',
      });
    expect(deckRes.status).toBe(201);
    const deckId = deckRes.body.id as string;

    // --- GET /study/overview: tudo novo, nada para hoje ---
    const overview = await a.get('/v1/study/overview');
    expect(overview.status).toBe(200);
    expect(overview.body.today).toEqual({
      dueToday: 0,
      overdue: 0,
      deckCount: 0,
      estimatedMinutes: 0,
    });
    expect(overview.body.secondsPerCard).toBe(40);
    expect(overview.body.decks).toEqual([
      expect.objectContaining({ id: deckId, cardCount: 4, newCount: 4, isMine: true, owner: null }),
    ]);
    expect(overview.body.subjects).toEqual([
      expect.objectContaining({ id: anatomia.id, years: [1], cardCount: 4, newCount: 4 }),
    ]);

    // --- Validacoes de POST /study/sessions ---
    const empty = await a.post('/v1/study/sessions').set('Origin', ORIGIN).send({});
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');

    const badLimit = await a
      .post('/v1/study/sessions')
      .set('Origin', ORIGIN)
      .send({ deckIds: [deckId], limit: 15 });
    expect(badLimit.status).toBe(400);

    const todayNothing = await a
      .post('/v1/study/sessions')
      .set('Origin', ORIGIN)
      .send({ mode: 'today' });
    expect(todayNothing.status).toBe(422);
    expect(todayNothing.body.error.code).toBe('NOTHING_TO_STUDY');

    const otherDeck = await b
      .post('/v1/study/sessions')
      .set('Origin', ORIGIN)
      .send({ deckIds: [deckId] });
    expect(otherDeck.status).toBe(404);
    expect(otherDeck.body.error.code).toBe('DECK_NOT_FOUND');

    const all = await a
      .post('/v1/study/sessions')
      .set('Origin', ORIGIN)
      .send({ subjectIds: [anatomia.id], limit: null, order: 'SHUFFLE' });
    expect(all.status).toBe(201);
    expect(all.body.total).toBe(4);
    expect(all.body.order).toBe('SHUFFLE');

    // --- Sessao: 4 cards novos na ordem do deck ---
    const created = await a
      .post('/v1/study/sessions')
      .set('Origin', ORIGIN)
      .send({ deckIds: [deckId], limit: 10 });
    expect(created.status).toBe(201);
    expect(created.body.total).toBe(4);
    expect(created.body.order).toBe('DUE_FIRST');
    expect(created.body.subjects).toEqual([expect.objectContaining({ id: anatomia.id })]);
    expect(created.body.cards.map((c: { question: string }) => c.question)).toEqual([
      'Q1',
      'Q2',
      'Q3',
      'Q4',
    ]);
    expect(created.body.cards[0]).toMatchObject({ deckId, year: 1, status: 'NEW', answer: 'R1' });
    const sessionId = created.body.sessionId as string;
    const cardIds = created.body.cards.map((c: { id: string }) => c.id) as string[];

    // --- Avaliacoes: Errei, Dificil, Facil, Facil ---
    const ratings = [
      { rating: 'AGAIN', durationMs: 999_999 }, // passa de 5 min: conta 5 min
      { rating: 'HARD', durationMs: 12_000 },
      { rating: 'GOOD', durationMs: 8_000 },
      { rating: 'GOOD', durationMs: 10_000 },
    ];
    const before = Date.now();
    for (const [i, r] of ratings.entries()) {
      const res = await a
        .post(`/v1/study/sessions/${sessionId}/reviews`)
        .set('Origin', ORIGIN)
        .send({ cardId: cardIds[i], ...r });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        cardId: cardIds[i],
        rating: r.rating,
        reviewed: i + 1,
        total: 4,
      });
      expect(new Date(res.body.due).getTime()).toBeGreaterThan(before);
    }

    // CardState e ReviewLog gravados na mesma transacao, com o tempo limitado.
    const state = await prisma.cardState.findUniqueOrThrow({
      where: { userId_cardId: { userId: userA, cardId: cardIds[0]! } },
    });
    expect(state.state).toBe(CardLearningState.LEARNING);
    expect(state.reps).toBe(1);
    expect(state.deckId).toBe(deckId);
    const logs = await prisma.reviewLog.findMany({
      where: { sessionId },
      orderBy: { reviewedAt: 'asc' },
    });
    expect(logs).toHaveLength(4);
    expect(logs[0]).toMatchObject({ durationMs: 300_000, stateBefore: 'NEW', rating: 'AGAIN' });

    // Mesma avaliacao de novo (clique duplo) e card de fora da sessao.
    const dup = await a
      .post(`/v1/study/sessions/${sessionId}/reviews`)
      .set('Origin', ORIGIN)
      .send({ cardId: cardIds[0], rating: 'GOOD', durationMs: 1000 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CARD_ALREADY_REVIEWED');

    const outside = await a
      .post(`/v1/study/sessions/${sessionId}/reviews`)
      .set('Origin', ORIGIN)
      .send({ cardId: randomUUID(), rating: 'GOOD', durationMs: 1000 });
    expect(outside.status).toBe(400);
    expect(outside.body.error.code).toBe('CARD_NOT_IN_SESSION');

    // Sessao de outra pessoa: 404.
    const foreignReview = await b
      .post(`/v1/study/sessions/${sessionId}/reviews`)
      .set('Origin', ORIGIN)
      .send({ cardId: cardIds[1], rating: 'GOOD', durationMs: 1000 });
    expect(foreignReview.status).toBe(404);
    expect(foreignReview.body.error.code).toBe('STUDY_SESSION_NOT_FOUND');
    const foreignFinish = await b
      .post(`/v1/study/sessions/${sessionId}/finish`)
      .set('Origin', ORIGIN);
    expect(foreignFinish.status).toBe(404);

    // --- Fim da sessao ---
    const finish = await a.post(`/v1/study/sessions/${sessionId}/finish`).set('Origin', ORIGIN);
    expect(finish.status).toBe(200);
    expect(finish.body).toMatchObject({
      sessionId,
      total: 4,
      reviewed: 4,
      counts: { again: 1, hard: 1, good: 2 },
      accuracyPct: 75,
      totalDurationMs: 330_000,
      avgDurationMs: 82_500,
      streak: { days: 1, increased: true },
    });
    expect(finish.body.subjects).toEqual([expect.objectContaining({ id: anatomia.id })]);
    expect(finish.body.toReview).toEqual([
      expect.objectContaining({ id: cardIds[0], question: 'Q1', year: 1, due: expect.any(String) }),
    ]);

    // Chamar de novo devolve o mesmo resumo.
    const again = await a.post(`/v1/study/sessions/${sessionId}/finish`).set('Origin', ORIGIN);
    expect(again.status).toBe(200);
    expect(again.body.finishedAt).toBe(finish.body.finishedAt);
    expect(again.body.counts).toEqual(finish.body.counts);

    const afterFinish = await a
      .post(`/v1/study/sessions/${sessionId}/reviews`)
      .set('Origin', ORIGIN)
      .send({ cardId: cardIds[1], rating: 'GOOD', durationMs: 1000 });
    expect(afterFinish.status).toBe(409);
    expect(afterFinish.body.error.code).toBe('STUDY_SESSION_FINISHED');

    // --- Estudar novamente: mesmos cards, mesma ordem ---
    const repeat = await a.post(`/v1/study/sessions/${sessionId}/repeat`).set('Origin', ORIGIN);
    expect(repeat.status).toBe(201);
    expect(repeat.body.sessionId).not.toBe(sessionId);
    expect(repeat.body.cards.map((c: { id: string }) => c.id)).toEqual(cardIds);

    // Uma avaliacao no repeat: o streak nao "aumenta" de novo no mesmo dia.
    const repeatReview = await a
      .post(`/v1/study/sessions/${repeat.body.sessionId}/reviews`)
      .set('Origin', ORIGIN)
      .send({ cardId: cardIds[0], rating: 'GOOD', durationMs: 20_000 });
    expect(repeatReview.status).toBe(201);
    const repeatFinish = await a
      .post(`/v1/study/sessions/${repeat.body.sessionId}/finish`)
      .set('Origin', ORIGIN);
    expect(repeatFinish.body.streak).toEqual({ days: 1, increased: false });
    expect(repeatFinish.body.reviewed).toBe(1);
    expect(repeatFinish.body.total).toBe(4);

    // --- GET /me/stats ---
    const stats = await a.get('/v1/me/stats');
    expect(stats.status).toBe(200);
    expect(stats.body).toMatchObject({
      streak: 1,
      studiedToday: true,
      cardsThisWeek: 5,
      cardsDeltaPct: null,
      minutesThisWeek: 6, // 350 s = 5,8 min
      accuracy7d: 80, // 4 de 5
    });
    expect(stats.body.weekStudied).toHaveLength(7);
    expect(stats.body.weekStudied.filter(Boolean)).toHaveLength(1);
    expect(stats.body.minutesPerDay).toHaveLength(7);

    // --- GET /me/agenda ---
    const agenda = await a.get('/v1/me/agenda?days=7');
    expect(agenda.status).toBe(200);
    expect(agenda.body.days).toHaveLength(7);
    // Os 4 cards voltam em minutos: todos dentro da janela de 7 dias.
    expect(agenda.body.total).toBe(4);
    expect(agenda.body.days[0].overdue).toBe(0);
    expect(agenda.body.date).toBe(agenda.body.days[0].date);
    for (const deck of agenda.body.decks as Array<{ id: string; overdueSince: string | null }>) {
      expect(deck.id).toBe(deckId);
      expect(deck.overdueSince).toBeNull();
    }

    const outOfWindow = await a.get('/v1/me/agenda?days=7&date=2000-01-01');
    expect(outOfWindow.status).toBe(400);
    expect(outOfWindow.body.error.fields.date).toBeDefined();

    // Tempo medio agora vem do historico: 350 s / 5 avaliacoes = 70 s.
    const overview2 = await a.get('/v1/study/overview');
    expect(overview2.body.secondsPerCard).toBe(70);

    // Duas avaliacoes do mesmo card ao mesmo tempo (clique duplo): so uma vale.
    const race = await a.post(`/v1/study/sessions/${sessionId}/repeat`).set('Origin', ORIGIN);
    expect(race.status).toBe(201);
    const send = () =>
      a
        .post(`/v1/study/sessions/${race.body.sessionId}/reviews`)
        .set('Origin', ORIGIN)
        .send({ cardId: cardIds[2], rating: 'GOOD', durationMs: 5_000 });
    const [r1, r2] = await Promise.all([send(), send()]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    expect(await prisma.reviewLog.count({ where: { sessionId: race.body.sessionId } })).toBe(1);
  });

  it('rotas de estudo exigem login', async () => {
    const res = await request(app.getHttpServer()).get('/v1/study/overview');
    expect(res.status).toBe(401);
    const stats = await request(app.getHttpServer()).get('/v1/me/stats');
    expect(stats.status).toBe(401);
  });
});
