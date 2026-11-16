import type { INestApplication} from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthModule } from '../src/modules/health/health.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

describe('GET /v1/health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responde 200 com status ok', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', version: expect.any(String) });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it('responde 404 no formato padrao para rota inexistente', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nao-existe');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });
});
