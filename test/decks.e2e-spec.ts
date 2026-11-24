import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createValidationPipe } from '../src/common/validation/validation-pipe.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/modules/mail/mail.service';
import { CardLearningState, ImportStatus, ReviewRating } from '../src/generated/prisma/enums';
import { startOfTomorrowUtc } from '../src/common/time/user-day';
import { StorageService } from '../src/modules/storage/storage.service';

const ORIGIN = 'http://localhost:3000';

describe('Decks + Imports flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const uniqueSuffix = Date.now().toString(36);
  const email = `e2e-decks-${uniqueSuffix}@test.sinapse.local`;
  const email2 = `e2e-decks2-${uniqueSuffix}@test.sinapse.local`;
  const ownerEmail = `e2e-decks-owner-${uniqueSuffix}@test.sinapse.local`;
  const password = 'senha-super-forte';
  let subjectIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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
    const subjects = await prisma.subject.findMany({
      where: { slug: { in: ['anatomia', 'cardiologia'] } },
      select: { id: true },
    });
    subjectIds = subjects.map((s) => s.id);
  });

  afterAll(async () => {
    for (const address of [email, email2, ownerEmail]) {
      const user = await prisma.user.findUnique({ where: { email: address } });
      if (user) {
        await prisma.deck.deleteMany({ where: { ownerId: user.id } });
        await prisma.importJob.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
      }
    }
    await app.close();
  });

  async function readyImport(userId: string, fileKey: string): Promise<string> {
    const job = await prisma.importJob.create({
      data: {
        userId,
        fileKey,
        fileName: 'revisao.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        status: ImportStatus.READY,
        pairs: [
          { question: 'P1?', answer: 'R1' },
          { question: 'P2?', answer: 'R2' },
        ],
        pairsFound: 2,
        pairsMissingAnswer: 0,
      },
    });
    return job.id;
  }

  it('fluxo: import fixture -> POST /decks -> list -> detail -> edit card', async () => {
    const agent = request.agent(app.getHttpServer());

    // 1) Registrar usuario (com Origin pro CSRF)
    const reg = await agent
      .post('/v1/auth/register')
      .set('Origin', ORIGIN)
      .send({ firstName: 'Davi', lastName: 'E2E', email, password });
    expect(reg.status).toBe(201);

    const me = await prisma.user.findUniqueOrThrow({ where: { email } });

    // 2) Fixture de ImportJob READY (nao usa o processor)
    const importJob = await prisma.importJob.create({
      data: {
        userId: me.id,
        fileKey: `imports/e2e-${uniqueSuffix}.pdf`,
        fileName: 'teste.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        status: ImportStatus.READY,
        pairs: [
          { question: 'O que faz a insulina?', answer: 'Regula glicose.' },
          { question: 'E a dopamina?', answer: 'Neurotransmissor.' },
          { question: 'Sem resposta?', answer: null },
        ],
        pairsFound: 3,
        pairsMissingAnswer: 1,
      },
    });

    // 3) POST /decks com o import
    const createRes = await agent.post('/v1/decks').set('Origin', ORIGIN).send({
      importId: importJob.id,
      name: 'Fisiologia basica',
      year: 1,
      subjectIds,
      visibility: 'PRIVATE',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.cardCount).toBe(3);
    expect(createRes.body.subjects).toHaveLength(2);
    const deckId = createRes.body.id as string;

    // ImportJob marcada como consumida
    const consumed = await prisma.importJob.findUniqueOrThrow({ where: { id: importJob.id } });
    expect(consumed.status).toBe(ImportStatus.CONSUMED);

    // 4) GET /decks?scope=mine mostra o deck
    const list = await agent.get('/v1/decks?scope=mine').set('Origin', ORIGIN);
    expect(list.status).toBe(200);
    expect(list.body.counts.mine).toBeGreaterThanOrEqual(1);
    expect(list.body.items.some((d: { id: string }) => d.id === deckId)).toBe(true);

    // 5) GET /decks/:id com myStats
    const detail = await agent.get(`/v1/decks/${deckId}`).set('Origin', ORIGIN);
    expect(detail.status).toBe(200);
    expect(detail.body.isMine).toBe(true);
    expect(detail.body.myStats.newCount).toBe(3);
    expect(detail.body.myStats.accuracy).toBeNull();
    const firstContentUpdatedAt = detail.body.contentUpdatedAt;

    // 6) GET /decks/:id/cards -> situação NEW
    const cards = await agent.get(`/v1/decks/${deckId}/cards`).set('Origin', ORIGIN);
    expect(cards.status).toBe(200);
    expect(cards.body.counts).toEqual({ all: 3, due: 0, new: 3, mastered: 0 });
    expect(cards.body.items).toHaveLength(3);
    const cardId = cards.body.items[0].id as string;

    // 7) PATCH /cards/:id edita pergunta
    // Esperamos uma mudanca em contentUpdatedAt entre o PATCH e o detalhe.
    await new Promise((r) => setTimeout(r, 20));
    const patched = await agent
      .patch(`/v1/cards/${cardId}`)
      .set('Origin', ORIGIN)
      .send({ question: 'O que faz a insulina (editada)?' });
    expect(patched.status).toBe(200);
    expect(patched.body.question).toBe('O que faz a insulina (editada)?');

    // 8) Detalhe deve refletir um contentUpdatedAt mais novo
    const detail2 = await agent.get(`/v1/decks/${deckId}`).set('Origin', ORIGIN);
    expect(new Date(detail2.body.contentUpdatedAt).getTime()).toBeGreaterThan(
      new Date(firstContentUpdatedAt).getTime(),
    );

    // 9) DELETE /cards/:id reduz cardCount
    const del = await agent.delete(`/v1/cards/${cardId}`).set('Origin', ORIGIN);
    expect(del.status).toBe(204);
    const detail3 = await agent.get(`/v1/decks/${deckId}`).set('Origin', ORIGIN);
    expect(detail3.body.cardCount).toBe(2);

    // 10) Favorite / unfavorite
    const fav = await agent.put(`/v1/decks/${deckId}/favorite`).set('Origin', ORIGIN);
    expect(fav.status).toBe(204);
    const afterFav = await agent.get('/v1/decks?scope=favorites').set('Origin', ORIGIN);
    expect(afterFav.body.items.some((d: { id: string }) => d.id === deckId)).toBe(true);
    const unfav = await agent.delete(`/v1/decks/${deckId}/favorite`).set('Origin', ORIGIN);
    expect(unfav.status).toBe(204);
  });

  it('revisao: fuso, situacao do card, importacao usada uma vez, recentes e erros', async () => {
    const agent = request.agent(app.getHttpServer());
    const reg = await agent
      .post('/v1/auth/register')
      .set('Origin', ORIGIN)
      .send({ firstName: 'Rev', lastName: 'Treze', email: email2, password });
    expect(reg.status).toBe(201);
    const me = await prisma.user.findUniqueOrThrow({ where: { email: email2 } });
    const storage = app.get(StorageService);

    // --- Importacao usada uma vez so, mesmo com dois pedidos ao mesmo tempo ---
    const fileKey = `imports/e2e-rev-${uniqueSuffix}.pdf`;
    await storage.putObject({
      key: fileKey,
      body: Buffer.from('%PDF-1.7'),
      contentType: 'application/pdf',
    });
    const importId = await readyImport(me.id, fileKey);
    const body = { importId, name: 'Revisao 13', year: 2, subjectIds, visibility: 'PRIVATE' };
    const [r1, r2] = await Promise.all([
      agent.post('/v1/decks').set('Origin', ORIGIN).send(body),
      agent.post('/v1/decks').set('Origin', ORIGIN).send(body),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const conflict = r1.status === 409 ? r1 : r2;
    expect(conflict.body.error.code).toBe('IMPORT_ALREADY_USED');
    expect(await prisma.deck.count({ where: { ownerId: me.id } })).toBe(1);
    const deckId = (r1.status === 201 ? r1 : r2).body.id as string;
    // O arquivo enviado sai do storage depois de virar cards.
    await expect(storage.getObject(fileKey)).rejects.toThrow();

    // --- myStats do PATCH no fuso do usuario (nao no de Sao Paulo) ---
    await agent.patch('/v1/me').set('Origin', ORIGIN).send({ timezone: 'Asia/Tokyo' });
    const cards = await prisma.card.findMany({ where: { deckId }, orderBy: { position: 'asc' } });
    const now = Date.now();
    const tokyoTomorrow = startOfTomorrowUtc('Asia/Tokyo', new Date(now)).getTime();
    const spTomorrow = startOfTomorrowUtc('America/Sao_Paulo', new Date(now)).getTime();
    // Entre as duas viradas de dia: "hoje" num fuso e "amanha" no outro.
    const due = new Date((tokyoTomorrow + spTomorrow) / 2);
    await prisma.cardState.create({
      data: {
        userId: me.id,
        cardId: cards[0]!.id,
        deckId,
        state: CardLearningState.REVIEW,
        due,
        scheduledDays: 3,
      },
    });
    const patched = await agent
      .patch(`/v1/decks/${deckId}`)
      .set('Origin', ORIGIN)
      .send({ name: 'Revisao 13 (editado)' });
    expect(patched.status).toBe(200);
    expect(patched.body.myStats.dueToday).toBe(due.getTime() < tokyoTomorrow ? 1 : 0);

    // --- PATCH /cards/:id devolve a situacao real do card, nao "Novo" ---
    await prisma.cardState.create({
      data: {
        userId: me.id,
        cardId: cards[1]!.id,
        deckId,
        state: CardLearningState.REVIEW,
        due: new Date(now + 40 * 86_400_000),
        scheduledDays: 40,
      },
    });
    const editedCard = await agent
      .patch(`/v1/cards/${cards[1]!.id}`)
      .set('Origin', ORIGIN)
      .send({ answer: 'R2 (editada)' });
    expect(editedCard.status).toBe(200);
    expect(editedCard.body).toMatchObject({ status: 'MASTERED', answer: 'R2 (editada)' });

    // --- Recentes: deck tirado dos salvos sai da lista ---
    const owner = await prisma.user.create({
      data: { firstName: 'Dona', lastName: 'Deck', email: ownerEmail, passwordHash: 'x' },
    });
    const community = await prisma.deck.create({
      data: {
        ownerId: owner.id,
        courseId:
          me.courseId ?? (await prisma.course.findFirstOrThrow({ where: { slug: 'medicina' } })).id,
        year: 1,
        name: 'Da comunidade',
        visibility: 'PUBLIC',
        cardCount: 1,
        contentUpdatedAt: new Date(),
        cards: { create: [{ question: 'Q?', answer: 'A', position: 1 }] },
      },
      include: { cards: true },
    });
    expect((await agent.put(`/v1/decks/${community.id}/save`).set('Origin', ORIGIN)).status).toBe(
      204,
    );
    await prisma.reviewLog.create({
      data: {
        userId: me.id,
        cardId: community.cards[0]!.id,
        deckId: community.id,
        rating: ReviewRating.GOOD,
        durationMs: 1000,
        stateBefore: CardLearningState.NEW,
        scheduledDays: 1,
      },
    });
    const recentIds = async (): Promise<string[]> =>
      ((await agent.get('/v1/decks/recent')).body as Array<{ id: string }>).map((d) => d.id);
    expect(await recentIds()).toContain(community.id);
    expect(
      (await agent.delete(`/v1/decks/${community.id}/save`).set('Origin', ORIGIN)).status,
    ).toBe(204);
    expect(await recentIds()).not.toContain(community.id);

    // --- Entradas invalidas: 400 em portugues, nunca 500 ---
    const tampered = Buffer.from(JSON.stringify({ id: 'nao-uuid', k: 'lixo' })).toString(
      'base64url',
    );
    for (const url of [
      `/v1/decks?cursor=${tampered}`,
      `/v1/decks/${deckId}/cards?cursor=${tampered}`,
    ]) {
      const res = await agent.get(url);
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toEqual({ cursor: 'Cursor inválido. Recarregue a lista.' });
    }
    const badImport = await agent
      .post(`/v1/decks/${deckId}/imports`)
      .set('Origin', ORIGIN)
      .send({ importId: 'abc' });
    expect(badImport.status).toBe(400);
    expect(badImport.body.error.fields).toEqual({ importId: 'Importação inválida.' });
    const badId = await agent.get('/v1/decks/nao-e-uuid');
    expect(badId.status).toBe(400);
    expect(badId.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos.',
      fields: { id: 'Identificador inválido.' },
    });
    const badLimit = await agent.get('/v1/decks/recent?limit=abc');
    expect(badLimit.status).toBe(400);
    expect(badLimit.body.error.fields).toEqual({ limit: 'Use um número inteiro.' });

    // --- Codigos de 404 especificos ---
    const usedAgain = await agent
      .post(`/v1/decks/${deckId}/imports`)
      .set('Origin', ORIGIN)
      .send({ importId });
    expect(usedAgain.status).toBe(409);
    expect(usedAgain.body.error.code).toBe('IMPORT_ALREADY_USED');
    const unknownDeck = await agent.delete(`/v1/decks/${community.id}`).set('Origin', ORIGIN);
    expect(unknownDeck.status).toBe(404);
    expect(unknownDeck.body.error).toEqual({
      code: 'DECK_NOT_FOUND',
      message: 'Deck não encontrado.',
    });
    const foreignImport = await readyImport(owner.id, `imports/e2e-owner-${uniqueSuffix}.pdf`);
    const notMine = await agent
      .post(`/v1/decks/${deckId}/imports`)
      .set('Origin', ORIGIN)
      .send({ importId: foreignImport });
    expect(notMine.status).toBe(404);
    expect(notMine.body.error.code).toBe('IMPORT_NOT_FOUND');
    const missingCard = await agent
      .patch(`/v1/cards/${community.cards[0]!.id}`)
      .set('Origin', ORIGIN)
      .send({ answer: 'x' });
    expect(missingCard.status).toBe(404);
    expect(missingCard.body.error.code).toBe('CARD_NOT_FOUND');
    const course = await request(app.getHttpServer()).get('/v1/courses/nao-existe');
    expect(course.status).toBe(404);
    expect(course.body.error.code).toBe('COURSE_NOT_FOUND');
  });

  it('GET /v1/courses/medicina devolve as 40 materias', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/courses/medicina')
      .set('Origin', ORIGIN);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('medicina');
    expect(res.body.years).toBe(6);
    expect(res.body.subjects.length).toBe(40);
  });
});
