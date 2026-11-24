import { randomUUID } from 'node:crypto';
import type { AppException } from '../errors/app.exception';
import { optionalIntQuery, uuidParam } from './params';

async function errorOf(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (err) {
    return (err as AppException).getResponse();
  }
  throw new Error('esperava erro');
}

describe('pipes de parametro', () => {
  it('uuidParam aceita UUID v4', async () => {
    const id = randomUUID();
    await expect(uuidParam().transform(id, { type: 'param', data: 'id' })).resolves.toBe(id);
  });

  it('uuidParam recusa com VALIDATION_ERROR em portugues', async () => {
    expect(
      await errorOf(() => uuidParam().transform('abc', { type: 'param', data: 'id' })),
    ).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos.',
        fields: { id: 'Identificador inválido.' },
      },
    });
  });

  it('optionalIntQuery: vazio passa, texto recusa', async () => {
    const pipe = optionalIntQuery('limit');
    await expect(
      pipe.transform(undefined as never, { type: 'query', data: 'limit' }),
    ).resolves.toBeUndefined();
    await expect(pipe.transform('4', { type: 'query', data: 'limit' })).resolves.toBe(4);
    expect(await errorOf(() => pipe.transform('abc', { type: 'query', data: 'limit' }))).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Dados inválidos.',
        fields: { limit: 'Use um número inteiro.' },
      },
    });
  });
});
