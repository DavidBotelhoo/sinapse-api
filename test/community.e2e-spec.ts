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
import { ImportStatus, ReportStatus } from '../src/generated/prisma/enums';

const ORIGIN = 'http://localhost:3000';

type Agent = ReturnType<typeof request.agent>;
type Json = Record<string, unknown>;

// Privacidade da Comunidade: nenhuma resposta pode trazer sobrenome, email ou a foto grande
// de outra pessoa, nem cards alem da previa para quem nao salvou o deck.
describe('Comunidade e denuncias (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now().toString(36);
  const tag = `cm${suffix}`; // vai no nome dos decks: ?q=tag isola os decks deste teste
  const password = 'senha-super-forte';

  // Dono dos decks: sobrenome e email unicos, para procurar no JSON de cada resposta.
  const owner = {
    email: `e2e-community-owner-${suffix}@test.sinapse.local`,
    firstName: 'Marina',
    lastName: `Sigilosa${suffix}`,
    id: '',
  };
  const viewer = { email: `e2e-community-viewer-${suffix}@test.sinapse.local`, id: '' };
  const saver = { email: `e2e-community-saver-${suffix}@test.sinapse.local`, id: '' };

  const hiddenCardTexts = [7, 8].flatMap((n) => [`SEGREDO-P${n}-${tag}`, `SEGREDO-R${n}-${tag}`]);

  let a: Agent; // dono
  let b: Agent; // so olha a Comunidade
  let c: Agent; // salva os decks

  const deck = { pub8: '', priv: '', toHide: '', recent: '' };
  const subjects = { anatomia: '', bioquimica: '', cardiologia: '' };

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

    const rows = await prisma.subject.findMany({
      where: { slug: { in: Object.keys(subjects) } },
      select: { id: true, slug: true },
    });
    for (const row of rows) subjects[row.slug as keyof typeof subjects] = row.id;

    a = request.agent(app.getHttpServer());
    b = request.agent(app.getHttpServer());
    c = request.agent(app.getHttpServer());
    owner.id = await register(a, owner.email, owner.firstName, owner.lastName);
    viewer.id = await register(b, viewer.email, 'Bruno', 'E2E');
    saver.id = await register(c, saver.email, 'Carla', 'E2E');

    // Avatar do dono: a chave da foto grande (256px); a miniatura de 64px fica ao lado.
    await prisma.user.update({
      where: { id: owner.id },
      data: { avatarKey: `avatars/${owner.id}.webp` },
    });

    const eight = Array.from({ length: 8 }, (_, i) => {
      const n = i + 1;
      return n <= 6
        ? { question: `Pergunta ${n} ${tag}`, answer: `Resposta ${n} ${tag}` }
        : { question: `SEGREDO-P${n}-${tag}`, answer: `SEGREDO-R${n}-${tag}` };
    });
    deck.pub8 = await createDeck(`Nervos cranianos ${tag}`, 'PUBLIC', 1, subjects.anatomia, eight);
    deck.priv = await createDeck(`Rascunho ${tag}`, 'PRIVATE', 1, subjects.anatomia, eight);
    deck.toHide = await createDeck(`Glicolise ${tag}`, 'PUBLIC', 2, subjects.bioquimica, [
      { question: `Glicose ${tag}`, answer: 'Piruvato' },
    ]);
    deck.recent = await createDeck(`Sopros ${tag}`, 'PUBLIC', 3, subjects.cardiologia, [
      { question: `Sopro ${tag}`, answer: 'Sistolico' },
    ]);

    // Datas fixas para a ordem "Recentes": recent > pub8 > toHide.
    const now = Date.now();
    await prisma.deck.update({
      where: { id: deck.recent },
      data: { contentUpdatedAt: new Date(now - 60_000) },
    });
    await prisma.deck.update({
      where: { id: deck.pub8 },
      data: { contentUpdatedAt: new Date(now - 2 * 60_000) },
    });
    await prisma.deck.update({
      where: { id: deck.toHide },
      data: { contentUpdatedAt: new Date(now - 3 * 60_000) },
    });
  });

  afterAll(async () => {
    const ids = [owner.id, viewer.id, saver.id].filter((id) => id.length > 0);
    // Deck primeiro (cascata em cards, saves, denuncias); o usuario leva as sessoes.
    await prisma.deck.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.importJob.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  async function register(
    agent: Agent,
    email: string,
    firstName: string,
    lastName: string,
  ): Promise<string> {
    const res = await agent
      .post('/v1/auth/register')
      .set('Origin', ORIGIN)
      .send({ firstName, lastName, email, password });
    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } });
    return user.id;
  }

  async function createDeck(
    name: string,
    visibility: 'PUBLIC' | 'PRIVATE',
    year: number,
    subjectId: string,
    pairs: Array<{ question: string; answer: string }>,
  ): Promise<string> {
    const job = await prisma.importJob.create({
      data: {
        userId: owner.id,
        fileKey: `imports/e2e-community-${randomUUID()}.pdf`,
        fileName: 'deck.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        status: ImportStatus.READY,
        pairs,
        pairsFound: pairs.length,
        pairsMissingAnswer: 0,
      },
    });
    const res = await a
      .post('/v1/decks')
      .set('Origin', ORIGIN)
      .send({ importId: job.id, name, year, subjectIds: [subjectId], visibility });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  // Percorre o JSON inteiro: nada de sobrenome, email, foto grande, colunas internas do
  // usuario ou texto dos cards 7 e 8; todo "owner" e exatamente { firstName, avatarUrl }.
  function assertNoLeak(body: unknown, where: string): void {
    const json = JSON.stringify(body);
    const secrets = [
      owner.lastName,
      owner.email,
      owner.email.split('@')[0]!,
      `avatars/${owner.id}.webp`,
      ...hiddenCardTexts,
    ];
    for (const secret of secrets) {
      if (json.includes(secret)) throw new Error(`${where}: vazou "${secret}" em ${json}`);
    }

    const forbiddenKeys = new Set(['lastName', 'email', 'passwordHash', 'avatarKey', 'ownerId']);
    const walk = (value: unknown, path: string): void => {
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, `${path}[${i}]`));
        return;
      }
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value as Json)) {
        const here = `${path}.${key}`;
        if (forbiddenKeys.has(key)) throw new Error(`${where}: campo proibido ${here}`);
        if (key === 'owner' && child !== null) {
          const ownerKeys = Object.keys(child as Json).sort();
          if (ownerKeys.join(',') !== 'avatarUrl,firstName') {
            throw new Error(`${where}: ${here} com campos ${ownerKeys.join(',')}`);
          }
          const url = (child as Json).avatarUrl;
          if (url !== null && !(typeof url === 'string' && url.endsWith('-64.webp'))) {
            throw new Error(
              `${where}: ${here}.avatarUrl nao e a miniatura: ${JSON.stringify(url)}`,
            );
          }
        }
        walk(child, here);
      }
    };
    walk(body, where);
  }

  async function communityList(agent: Agent, query: string): Promise<request.Response> {
    const res = await agent.get(`/v1/community/decks?${query}`);
    assertNoLeak(res.body, `GET /community/decks?${query}`);
    return res;
  }

  const ids = (res: request.Response): string[] =>
    (res.body.items as Array<{ id: string }>).map((d) => d.id);

  it('lista: so decks publicos, dono com primeiro nome e miniatura, e os do autor com isMine', async () => {
    const res = await communityList(b, `q=${tag}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(ids(res).sort()).toEqual([deck.pub8, deck.toHide, deck.recent].sort());
    expect(ids(res)).not.toContain(deck.priv);

    const pub8 = (res.body.items as Json[]).find((d) => d.id === deck.pub8)!;
    expect(pub8).toEqual({
      id: deck.pub8,
      name: `Nervos cranianos ${tag}`,
      year: 1,
      subjects: [{ id: subjects.anatomia, slug: 'anatomia', name: 'Anatomia' }],
      cardCount: 8,
      saveCount: 0,
      isSaved: false,
      isMine: false,
      owner: { firstName: 'Marina', avatarUrl: expect.stringMatching(/-64\.webp$/) },
    });
    expect((pub8.owner as Json).avatarUrl).toMatch(new RegExp(`/avatars/${owner.id}-64\\.webp$`));

    // O autor ve os proprios decks publicos, marcados como seus.
    const mine = await a.get(`/v1/community/decks?q=${tag}`);
    expect(mine.body.total).toBe(3);
    expect((mine.body.items as Json[]).every((d) => d.isMine === true)).toBe(true);
  });

  it('filtros, busca por materia sem acento, as duas ordens e a paginacao', async () => {
    const byYear = await communityList(b, `q=${tag}&year=2&year=3`);
    expect(byYear.body.total).toBe(2);
    expect(ids(byYear).sort()).toEqual([deck.toHide, deck.recent].sort());

    const bySubject = await communityList(b, `q=${tag}&subjectIds=${subjects.anatomia}`);
    expect(ids(bySubject)).toEqual([deck.pub8]);

    // "Bioquímica" com e sem acento acha o deck pela materia (o nome nao tem a palavra).
    for (const q of ['bioquimica', encodeURIComponent('BIOQUÍMICA')]) {
      const res = await communityList(b, `q=${q}&sort=recent&limit=50`);
      expect(ids(res)).toContain(deck.toHide);
      expect(ids(res)).not.toContain(deck.pub8);
    }

    // Populares: mais salvos primeiro (saveCount de mentira so para a ordem).
    await prisma.deck.update({ where: { id: deck.recent }, data: { saveCount: 5 } });
    await prisma.deck.update({ where: { id: deck.toHide }, data: { saveCount: 3 } });
    const popular = await communityList(b, `q=${tag}`);
    expect(ids(popular)).toEqual([deck.recent, deck.toHide, deck.pub8]);
    const recent = await communityList(b, `q=${tag}&sort=recent`);
    expect(ids(recent)).toEqual([deck.recent, deck.pub8, deck.toHide]);

    // Pagina de 1 em 1: mesma ordem, sem repetir, e o ultimo nextCursor e null.
    for (const sort of ['popular', 'recent'] as const) {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: string =
          `q=${tag}&sort=${sort}&limit=1` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
        const page = await communityList(b, query);
        expect(page.status).toBe(200);
        expect(page.body.total).toBe(3);
        seen.push(...ids(page));
        cursor = page.body.nextCursor as string | null;
      } while (cursor && seen.length < 10);
      expect(seen).toEqual(sort === 'popular' ? ids(popular) : ids(recent));
    }

    // Cursor de uma ordem nao serve na outra; lixo tambem nao.
    const first = await communityList(b, `q=${tag}&limit=1`);
    const wrongSort = await b.get(
      `/v1/community/decks?q=${tag}&sort=recent&cursor=${encodeURIComponent(first.body.nextCursor as string)}`,
    );
    expect(wrongSort.status).toBe(400);
    expect(wrongSort.body.error.code).toBe('VALIDATION_ERROR');
    expect(wrongSort.body.error.fields.cursor).toEqual(expect.any(String));
    expect((await b.get('/v1/community/decks?cursor=lixo')).status).toBe(400);
    expect((await b.get('/v1/community/decks?sort=saves')).status).toBe(400);

    await prisma.deck.updateMany({
      where: { id: { in: [deck.recent, deck.toHide] } },
      data: { saveCount: 0 },
    });
  });

  it('previa: 6 primeiros cards; o resto so para quem salvou', async () => {
    const preview = await b.get(`/v1/community/decks/${deck.pub8}`);
    expect(preview.status).toBe(200);
    assertNoLeak(preview.body, 'GET /community/decks/:id');
    expect(preview.body).toMatchObject({
      id: deck.pub8,
      cardCount: 8,
      saveCount: 0,
      isSaved: false,
      isMine: false,
      contentUpdatedAt: expect.any(String),
    });
    expect(preview.body.previewCards).toHaveLength(6);
    expect((preview.body.previewCards as Json[]).map((card) => card.position)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(preview.body.previewCards[0]).toEqual({
      id: expect.any(String),
      position: 1,
      question: `Pergunta 1 ${tag}`,
      answer: `Resposta 1 ${tag}`,
    });

    // Quem nao salvou nao chega nos outros cards por nenhuma porta.
    const doors: Array<[string, request.Response]> = [
      ['GET /decks/:id', await b.get(`/v1/decks/${deck.pub8}`)],
      ['GET /decks/:id/cards', await b.get(`/v1/decks/${deck.pub8}/cards`)],
      [
        'GET /decks/:id/cards?status=new',
        await b.get(`/v1/decks/${deck.pub8}/cards?status=new&limit=100`),
      ],
      [
        'POST /study/sessions',
        await b
          .post('/v1/study/sessions')
          .set('Origin', ORIGIN)
          .send({ deckIds: [deck.pub8] }),
      ],
      [
        'PUT /decks/:id/favorite',
        await b.put(`/v1/decks/${deck.pub8}/favorite`).set('Origin', ORIGIN),
      ],
    ];
    for (const [label, res] of doors) {
      expect({ label, status: res.status }).toEqual({ label, status: 404 });
      assertNoLeak(res.body, label);
    }

    // Privado: nem previa.
    const priv = await b.get(`/v1/community/decks/${deck.priv}`);
    expect(priv.status).toBe(404);
    expect(priv.body.error.code).toBe('DECK_NOT_FOUND');

    // Depois de salvar: a previa continua com 6, mas a lista do deck traz os 8.
    expect((await c.put(`/v1/decks/${deck.pub8}/save`).set('Origin', ORIGIN)).status).toBe(204);
    const savedPreview = await c.get(`/v1/community/decks/${deck.pub8}`);
    assertNoLeak(savedPreview.body, 'GET /community/decks/:id (salvo)');
    expect(savedPreview.body).toMatchObject({ isSaved: true, saveCount: 1 });
    expect(savedPreview.body.previewCards).toHaveLength(6);
    const allCards = await c.get(`/v1/decks/${deck.pub8}/cards?limit=100`);
    expect(allCards.status).toBe(200);
    expect(allCards.body.items).toHaveLength(8);

    // Quem nao salvou ve o saveCount novo, mas isSaved continua falso para ele.
    const listForB = await communityList(b, `q=${tag}`);
    expect((listForB.body.items as Json[]).find((d) => d.id === deck.pub8)).toMatchObject({
      saveCount: 1,
      isSaved: false,
    });

    // Telas de quem salvou que mostram o dono (Flashcards, detalhe, Estudar): mesma regra.
    const flashcards = await c.get('/v1/decks?scope=community');
    expect(ids(flashcards)).toContain(deck.pub8);
    assertNoLeak(flashcards.body, 'GET /decks?scope=community');
    const detail = await c.get(`/v1/decks/${deck.pub8}`);
    expect(detail.body.owner.avatarUrl).toMatch(/-64\.webp$/);
    assertNoLeak(detail.body, 'GET /decks/:id (salvo)');
    const overview = await c.get('/v1/study/overview');
    assertNoLeak(overview.body, 'GET /study/overview');

    // Remover dos meus flashcards fecha a porta de novo.
    expect((await c.delete(`/v1/decks/${deck.pub8}/save`).set('Origin', ORIGIN)).status).toBe(204);
    expect((await c.get(`/v1/decks/${deck.pub8}/cards`)).status).toBe(404);
  });

  it('ocultado pela moderacao: some da Comunidade, quem ja salvou continua estudando', async () => {
    expect((await c.put(`/v1/decks/${deck.toHide}/save`).set('Origin', ORIGIN)).status).toBe(204);
    await prisma.deck.update({ where: { id: deck.toHide }, data: { hiddenAt: new Date() } });

    // Fora da lista, do total, da previa, de salvar e de denunciar (para quem nao salvou).
    const list = await communityList(b, `q=${tag}`);
    expect(list.body.total).toBe(2);
    expect(ids(list)).not.toContain(deck.toHide);
    expect((await communityList(c, `q=${tag}`)).body.total).toBe(2);
    for (const agent of [b, c]) {
      const res = await agent.get(`/v1/community/decks/${deck.toHide}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DECK_NOT_FOUND');
    }
    expect((await b.put(`/v1/decks/${deck.toHide}/save`).set('Origin', ORIGIN)).status).toBe(404);
    const reportHidden = await b
      .post(`/v1/decks/${deck.toHide}/report`)
      .set('Origin', ORIGIN)
      .send({ reason: 'SPAM' });
    expect(reportHidden.status).toBe(404);

    // Quem salvou continua com o deck em Flashcards, no detalhe, nos cards e no estudo.
    expect(ids(await c.get('/v1/decks?scope=community'))).toContain(deck.toHide);
    expect(ids(await c.get('/v1/decks?scope=all'))).toContain(deck.toHide);
    expect((await c.get(`/v1/decks/${deck.toHide}`)).status).toBe(200);
    expect((await c.get(`/v1/decks/${deck.toHide}/cards`)).body.items).toHaveLength(1);
    const session = await c
      .post('/v1/study/sessions')
      .set('Origin', ORIGIN)
      .send({ deckIds: [deck.toHide] });
    expect(session.status).toBe(201);
    expect(session.body.total).toBe(1);

    // E ainda pode denunciar.
    const reportBySaver = await c
      .post(`/v1/decks/${deck.toHide}/report`)
      .set('Origin', ORIGIN)
      .send({ reason: 'WRONG_CONTENT' });
    expect(reportBySaver.status).toBe(204);

    // Se remover dos salvos, a sessao retomada nao mostra mais os cards do deck.
    expect((await c.delete(`/v1/decks/${deck.toHide}/save`).set('Origin', ORIGIN)).status).toBe(
      204,
    );
    const resumed = await c.get(`/v1/study/sessions/${session.body.sessionId as string}`);
    expect(resumed.status).toBe(200);
    expect(resumed.body.total).toBe(0);
    expect(resumed.body.cards).toEqual([]);
    expect((await c.put(`/v1/decks/${deck.toHide}/save`).set('Origin', ORIGIN)).status).toBe(404);
  });

  it('denuncia: uma por usuario e deck, repetir troca o motivo e reabre', async () => {
    const report = (agent: Agent, deckId: string, body: Json): Promise<request.Response> =>
      agent.post(`/v1/decks/${deckId}/report`).set('Origin', ORIGIN).send(body);

    expect((await report(b, deck.pub8, { reason: 'SPAM' })).status).toBe(204);
    const first = await prisma.deckReport.findMany({
      where: { deckId: deck.pub8, reporterId: viewer.id },
    });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ reason: 'SPAM', details: null, status: ReportStatus.OPEN });

    // Um admin arquivou; denunciar de novo troca o motivo e volta para a fila.
    await prisma.deckReport.update({
      where: { id: first[0]!.id },
      data: { status: ReportStatus.DISMISSED, resolvedAt: new Date() },
    });
    expect(
      (await report(b, deck.pub8, { reason: 'COPYRIGHT', details: '  copiado de um livro  ' }))
        .status,
    ).toBe(204);
    const again = await prisma.deckReport.findMany({
      where: { deckId: deck.pub8, reporterId: viewer.id },
    });
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({
      id: first[0]!.id,
      reason: 'COPYRIGHT',
      details: 'copiado de um livro',
      status: ReportStatus.OPEN,
      resolvedAt: null,
    });

    // Outra pessoa denunciando o mesmo deck e outra linha.
    expect((await report(c, deck.pub8, { reason: 'OFFENSIVE' })).status).toBe(204);
    expect(await prisma.deckReport.count({ where: { deckId: deck.pub8 } })).toBe(2);

    const invalid = await report(b, deck.pub8, { reason: 'EASY' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.fields.reason).toBe('Escolha um motivo.');
    expect((await report(b, deck.pub8, { reason: 'OTHER', details: 'x'.repeat(501) })).status).toBe(
      400,
    );

    for (const [agent, deckId] of [
      [b, deck.priv], // privado
      [a, deck.pub8], // o proprio deck
      [b, randomUUID()], // nao existe
    ] as const) {
      const res = await report(agent, deckId, { reason: 'SPAM' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('DECK_NOT_FOUND');
    }
  });

  it('sem login: 401 na Comunidade e na denuncia', async () => {
    const anon = request(app.getHttpServer());
    expect((await anon.get('/v1/community/decks')).status).toBe(401);
    expect((await anon.get(`/v1/community/decks/${deck.pub8}`)).status).toBe(401);
    const res = await anon
      .post(`/v1/decks/${deck.pub8}/report`)
      .set('Origin', ORIGIN)
      .send({ reason: 'SPAM' });
    expect(res.status).toBe(401);
  });
});
