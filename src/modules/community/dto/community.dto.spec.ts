import type { ArgumentMetadata } from '@nestjs/common';
import { createValidationPipe } from '../../../common/validation/validation-pipe.factory';
import { CommunityDecksQueryDto, CommunitySort } from './community.dto';

const SUBJECT = '7f1f2c6c-5a2a-4e2e-8f1e-9c7f9e0a1b2c';
const meta: ArgumentMetadata = { type: 'query', metatype: CommunityDecksQueryDto };

describe('CommunityDecksQueryDto (ValidationPipe global)', () => {
  const pipe = createValidationPipe();
  const run = (query: Record<string, unknown>): Promise<CommunityDecksQueryDto> =>
    pipe.transform(query, meta) as Promise<CommunityDecksQueryDto>;

  it('sem nada: populares, 20 por pagina', async () => {
    const dto = await run({});
    expect(dto.sort).toBe(CommunitySort.POPULAR);
    expect(dto.limit).toBe(20);
  });

  it('query string solta vira array (?year=2&subjectIds=...)', async () => {
    const dto = await run({ year: '2', subjectIds: SUBJECT, sort: 'recent', limit: '12' });
    expect(dto.year).toEqual([2]);
    expect(dto.subjectIds).toEqual([SUBJECT]);
    expect(dto.sort).toBe(CommunitySort.RECENT);
    expect(dto.limit).toBe(12);
  });

  it('corta espacos da busca', async () => {
    expect((await run({ q: '  farmaco  ' })).q).toBe('farmaco');
  });

  it.each([
    ['sort', { sort: 'saves' }],
    ['limit', { limit: '0' }],
    ['limit', { limit: '51' }],
    ['year', { year: ['1', '13'] }],
    ['subjectIds', { subjectIds: 'cardio' }],
    ['q', { q: 'x'.repeat(81) }],
  ])('recusa %s invalido', async (field, query) => {
    await expect(run(query)).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR', fields: { [field]: expect.any(String) } } },
    });
  });

  it('recusa filtro fora do contrato (ex.: ownerId)', async () => {
    await expect(run({ ownerId: SUBJECT })).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR' } },
    });
  });
});
