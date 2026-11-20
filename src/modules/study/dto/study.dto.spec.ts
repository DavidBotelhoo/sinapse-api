import type { ArgumentMetadata } from '@nestjs/common';
import { createValidationPipe } from '../../../common/validation/validation-pipe.factory';
import { CreateStudySessionDto } from './study.dto';

const DECK = '7f1f2c6c-5a2a-4e2e-8f1e-9c7f9e0a1b2c';
const meta: ArgumentMetadata = { type: 'body', metatype: CreateStudySessionDto };

describe('CreateStudySessionDto (ValidationPipe global)', () => {
  const pipe = createValidationPipe();

  it('limit: null (Todos) chega como null, nao como 0 nem ausente', async () => {
    const dto = (await pipe.transform(
      { deckIds: [DECK], limit: null },
      meta,
    )) as CreateStudySessionDto;
    expect(dto.limit).toBeNull();
  });

  it('sem limit fica undefined (o servico aplica o padrao)', async () => {
    const dto = (await pipe.transform({ deckIds: [DECK] }, meta)) as CreateStudySessionDto;
    expect(dto.limit).toBeUndefined();
  });

  it.each([10, 20, 30])('aceita limit=%i', async (limit) => {
    const dto = (await pipe.transform({ deckIds: [DECK], limit }, meta)) as CreateStudySessionDto;
    expect(dto.limit).toBe(limit);
  });

  it.each([0, 15, 100, '20'])('rejeita limit=%p', async (limit) => {
    await expect(pipe.transform({ deckIds: [DECK], limit }, meta)).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR' } },
    });
  });

  it('rejeita campos fora do contrato', async () => {
    await expect(
      pipe.transform({ deckIds: [DECK], now: '2026-01-01T00:00:00Z' }, meta),
    ).rejects.toMatchObject({ response: { error: { code: 'VALIDATION_ERROR' } } });
  });
});
