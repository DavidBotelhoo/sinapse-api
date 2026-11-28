import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { MailService } from '../src/modules/mail/mail.service';
import { StorageService } from '../src/modules/storage/storage.service';

// App inteiro, com os guards globais e a mesma configuracao HTTP do main.ts.
describe('App: health, erros e arquivos publicos (e2e)', () => {
  let app: NestExpressApplication;
  let storage: StorageService;
  const tag = `e2e-${Date.now().toString(36)}`;
  // Gravados pelo StorageService: o teste vale para o disco e para o bucket (STORAGE_DRIVER).
  const keys = {
    avatar: `avatars/${tag}.webp`,
    importFile: `imports/${tag}.pdf`,
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({ enqueuePasswordReset: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app);
    await app.init();

    storage = app.get(StorageService);
    await storage.putObject({
      key: keys.avatar,
      body: Buffer.from('avatar'),
      contentType: 'image/webp',
    });
    await storage.putObject({
      key: keys.importFile,
      body: Buffer.from('%PDF-1.7 privado'),
      contentType: 'application/pdf',
    });
  });

  afterAll(async () => {
    await storage.deleteObject(keys.avatar);
    await storage.deleteObject(keys.importFile);
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
    expect(avatar.headers['content-type']).toBe('image/webp');
    expect(Buffer.from(avatar.body as Buffer).toString()).toBe('avatar');

    // Mesma foto de novo: o navegador confere pelo ETag e recebe 304, sem o arquivo.
    const again = await request(app.getHttpServer())
      .get(`/uploads/avatars/${tag}.webp`)
      .set('If-None-Match', avatar.headers['etag'] as string);
    expect(again.status).toBe(304);

    const imported = await request(app.getHttpServer()).get(`/uploads/imports/${tag}.pdf`);
    expect(imported.status).toBe(404);
    expect(imported.text).not.toContain('privado');

    // Nem saindo da pasta das fotos.
    const escaped = await request(app.getHttpServer()).get(
      `/uploads/avatars/..%2Fimports%2F${tag}.pdf`,
    );
    expect(escaped.status).toBe(404);
    expect(escaped.text).not.toContain('privado');
  });

  it('foto que nao existe: 404 no formato padrao', async () => {
    const res = await request(app.getHttpServer()).get('/uploads/avatars/nao-existe.webp');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' },
    });
  });
});
