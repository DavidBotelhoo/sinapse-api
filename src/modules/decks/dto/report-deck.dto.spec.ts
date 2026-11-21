import type { ArgumentMetadata } from '@nestjs/common';
import { createValidationPipe } from '../../../common/validation/validation-pipe.factory';
import { ReportDeckDto } from './report-deck.dto';

const meta: ArgumentMetadata = { type: 'body', metatype: ReportDeckDto };

describe('ReportDeckDto (ValidationPipe global)', () => {
  const pipe = createValidationPipe();
  const run = (body: unknown): Promise<ReportDeckDto> =>
    pipe.transform(body, meta) as Promise<ReportDeckDto>;

  it.each(['WRONG_CONTENT', 'COPYRIGHT', 'OFFENSIVE', 'SPAM', 'OTHER'])(
    'aceita o motivo %s sem detalhes',
    async (reason) => {
      const dto = await run({ reason });
      expect(dto.reason).toBe(reason);
      expect(dto.details).toBeUndefined();
    },
  );

  it('corta os espacos dos detalhes', async () => {
    const dto = await run({ reason: 'OTHER', details: '  resposta errada no card 3  ' });
    expect(dto.details).toBe('resposta errada no card 3');
  });

  it.each(['', '   ', null])('detalhes vazios (%p) viram null', async (details) => {
    const dto = await run({ reason: 'SPAM', details });
    expect(dto.details).toBeNull();
  });

  it('aceita 500 caracteres e recusa 501', async () => {
    await expect(run({ reason: 'OTHER', details: 'a'.repeat(500) })).resolves.toBeDefined();
    await expect(run({ reason: 'OTHER', details: 'a'.repeat(501) })).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR', fields: { details: expect.any(String) } } },
    });
  });

  it.each([undefined, 'EASY', 'spam', 3])('recusa o motivo %p', async (reason) => {
    await expect(run({ reason })).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR', fields: { reason: 'Escolha um motivo.' } } },
    });
  });

  it('recusa campos fora do contrato', async () => {
    await expect(run({ reason: 'SPAM', status: 'DISMISSED' })).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR' } },
    });
  });
});
