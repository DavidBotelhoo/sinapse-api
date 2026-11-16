import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createValidationPipe } from '../src/common/validation/validation-pipe.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/modules/mail/mail.service';

const ORIGIN = 'http://localhost:3000';

function setCommonHeaders(req: request.Test): request.Test {
  return req.set('Origin', ORIGIN);
}

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const uniqueSuffix = Date.now().toString(36);
  const email = `e2e-${uniqueSuffix}@test.sinapse.local`;
  const password = 'senha-super-forte';

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
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('fluxo completo: register -> /me -> refresh -> logout -> /me (401)', async () => {
    const agent = request.agent(app.getHttpServer());

    // register
    const registerRes = await setCommonHeaders(
      agent.post('/v1/auth/register').send({
        firstName: 'Davi',
        lastName: 'E2E',
        email,
        password,
      }),
    );
    expect(registerRes.status).toBe(201);
    expect(registerRes.body).toMatchObject({ email, firstName: 'Davi', lastName: 'E2E' });

    const setCookies = asArray(registerRes.headers['set-cookie']);
    expect(setCookies.some((c) => c.startsWith('sn_access='))).toBe(true);
    expect(setCookies.some((c) => c.startsWith('sn_refresh='))).toBe(true);

    // /me
    const meRes = await setCommonHeaders(agent.get('/v1/me'));
    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(email);
    expect(meRes.body.subscription.status).toBe('NONE');

    // refresh -> deve rotacionar os cookies
    const refreshRes = await setCommonHeaders(agent.post('/v1/auth/refresh'));
    expect(refreshRes.status).toBe(204);
    const refreshSetCookies = asArray(refreshRes.headers['set-cookie']);
    expect(refreshSetCookies.some((c) => c.startsWith('sn_access='))).toBe(true);
    expect(refreshSetCookies.some((c) => c.startsWith('sn_refresh='))).toBe(true);

    // /me continua funcionando apos refresh
    const meAfterRefresh = await setCommonHeaders(agent.get('/v1/me'));
    expect(meAfterRefresh.status).toBe(200);

    // logout limpa os cookies
    const logoutRes = await setCommonHeaders(agent.post('/v1/auth/logout'));
    expect(logoutRes.status).toBe(204);
    const clearedCookies = asArray(logoutRes.headers['set-cookie']);
    expect(clearedCookies.some((c) => c.startsWith('sn_access=;'))).toBe(true);
    expect(clearedCookies.some((c) => c.startsWith('sn_refresh=;'))).toBe(true);

    // /me sem cookies -> 401
    const meAfterLogout = await setCommonHeaders(
      request(app.getHttpServer()).get('/v1/me'),
    );
    expect(meAfterLogout.status).toBe(401);
    expect(meAfterLogout.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('login com senha errada devolve INVALID_CREDENTIALS e mensagem em pt-BR', async () => {
    const res = await setCommonHeaders(
      request(app.getHttpServer()).post('/v1/auth/login').send({ email, password: 'errada' }),
    );
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      error: { code: 'INVALID_CREDENTIALS', message: 'Email ou senha nao conferem.' },
    });
  });

  it('register com email duplicado devolve EMAIL_ALREADY_REGISTERED', async () => {
    const res = await setCommonHeaders(
      request(app.getHttpServer()).post('/v1/auth/register').send({
        firstName: 'X',
        lastName: 'Y',
        email,
        password,
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: { code: 'EMAIL_ALREADY_REGISTERED' },
    });
  });

  it('POST sem Origin correto e bloqueado pelo CsrfGuard', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('Origin', 'http://evil.example.com')
      .send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'CSRF_FORBIDDEN' } });
  });

  it('validacao devolve fields em pt-BR', async () => {
    const res = await setCommonHeaders(
      request(app.getHttpServer()).post('/v1/auth/register').send({
        firstName: '',
        lastName: '',
        email: 'nao-e-email',
        password: '123',
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toMatchObject({
      firstName: expect.any(String),
      lastName: expect.any(String),
      email: 'Email invalido.',
      password: 'Use pelo menos 8 caracteres.',
    });
  });

  it('forgot-password sempre responde 204, exista o email ou nao', async () => {
    const a = await setCommonHeaders(
      request(app.getHttpServer()).post('/v1/auth/forgot-password').send({ email: 'nao-existe@x.com' }),
    );
    const b = await setCommonHeaders(
      request(app.getHttpServer()).post('/v1/auth/forgot-password').send({ email }),
    );
    expect(a.status).toBe(204);
    expect(b.status).toBe(204);
  });
});

function asArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
