import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createValidationPipe } from '../src/common/validation/validation-pipe.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/modules/mail/mail.service';
import { ImportStatus } from '../src/generated/prisma/enums';

const ORIGIN = 'http://localhost:3000';

describe('Decks + Imports flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const uniqueSuffix = Date.now().toString(36);
  const email = `e2e-decks-${uniqueSuffix}@test.sinapse.local`;
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
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.deck.deleteMany({ where: { ownerId: user.id } });
      await prisma.importJob.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

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
    const createRes = await agent
      .post('/v1/decks')
      .set('Origin', ORIGIN)
      .send({
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

  it('GET /v1/courses/medicina devolve as 40 materias', async () => {
    const res = await request(app.getHttpServer()).get('/v1/courses/medicina').set('Origin', ORIGIN);
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('medicina');
    expect(res.body.years).toBe(6);
    expect(res.body.subjects.length).toBe(40);
  });
});
