import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createValidationPipe } from '../src/common/validation/validation-pipe.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/modules/mail/mail.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { avatarThumbKey } from '../src/modules/users/public-owner';

const ORIGIN = 'http://localhost:3000';

// Foto de perfil: enviar e remover (a tela de Perfil tem "Trocar foto" e "Remover").
describe('Foto de perfil (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;

  const email = `e2e-users-${Date.now().toString(36)}@test.sinapse.local`;

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
    storage = app.get(StorageService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('envia e remove a foto; remover sem foto responde igual', async () => {
    const agent = request.agent(app.getHttpServer());
    const reg = await agent
      .post('/v1/auth/register')
      .set('Origin', ORIGIN)
      .send({ firstName: 'Ana', lastName: 'E2E', email, password: 'senha-super-forte' });
    expect(reg.status).toBe(201);

    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 14, g: 92, b: 94 } },
    })
      .png()
      .toBuffer();

    const up = await agent
      .post('/v1/me/avatar')
      .set('Origin', ORIGIN)
      .attach('file', png, { filename: 'foto.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    expect(up.body.avatarUrl).toEqual(expect.any(String));

    const { avatarKey } = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { avatarKey: true },
    });
    expect(avatarKey).toBeTruthy();
    await expect(storage.getObject(avatarKey!)).resolves.toBeInstanceOf(Buffer);

    const del = await agent.delete('/v1/me/avatar').set('Origin', ORIGIN);
    expect(del.status).toBe(200);
    expect(del.body.avatarUrl).toBeNull();
    expect(del.body.email).toBe(email);

    const after = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { avatarKey: true },
    });
    expect(after.avatarKey).toBeNull();
    // As duas versoes saem do storage.
    await expect(storage.getObject(avatarKey!)).rejects.toThrow();
    await expect(storage.getObject(avatarThumbKey(avatarKey!)!)).rejects.toThrow();

    const again = await agent.delete('/v1/me/avatar').set('Origin', ORIGIN);
    expect(again.status).toBe(200);
    expect(again.body.avatarUrl).toBeNull();
  });

  it('remover a foto exige login', async () => {
    const res = await request(app.getHttpServer()).delete('/v1/me/avatar').set('Origin', ORIGIN);
    expect(res.status).toBe(401);
  });
});
