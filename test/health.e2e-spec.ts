import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp, UPLOADS_DIR } from '../src/app.setup';
import { MailService } from '../src/modules/mail/mail.service';

// App inteiro, com os guards globais e a mesma configuracao HTTP do main.ts.
describe('App: health, erros e arquivos publicos (e2e)', () => {
  let app: NestExpressApplication;
  const tag = `e2e-${Date.now().toString(36)}`;
  const files = {
    avatar: resolve(UPLOADS_DIR, 'avatars', `${tag}.webp`),
    importFile: resolve(UPLOADS_DIR, 'imports', `${tag}.pdf`),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({ enqueuePasswordReset: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app);
    await app.init();

    await mkdir(resolve(UPLOADS_DIR, 'avatars'), { recursive: true });
    await mkdir(resolve(UPLOADS_DIR, 'imports'), { recursive: true });
    await writeFile(files.avatar, 'avatar');
    await writeFile(files.importFile, '%PDF-1.7 privado');
  });

  afterAll(async () => {
    await rm(files.avatar, { force: true });
    await rm(files.importFile, { force: true });
    await app.close();
  });

  it('GET /v1/health responde sem login', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', version: expect.any(String) });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('rota inexistente: 404 no formato padrao, em portugues', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' },
    });
  });

  it('JSON malformado: 400 em portugues', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'BAD_REQUEST', message: 'Requisição inválida.' } });
  });

  it('fotos de perfil sao publicas; arquivos importados nao', async () => {
    const avatar = await request(app.getHttpServer()).get(`/uploads/avatars/${tag}.webp`);
    expect(avatar.status).toBe(200);

    const imported = await request(app.getHttpServer()).get(`/uploads/imports/${tag}.pdf`);
    expect(imported.status).toBe(404);
    expect(imported.text).not.toContain('privado');
  });
});
