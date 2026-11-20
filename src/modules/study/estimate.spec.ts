import {
  averageMsPerCard,
  clampDurationMs,
  DEFAULT_MS_PER_CARD,
  estimatedMinutes,
  MAX_REVIEW_DURATION_MS,
} from './estimate';

describe('clampDurationMs', () => {
  it('limita entre 0 e 5 minutos', () => {
    expect(clampDurationMs(-50)).toBe(0);
    expect(clampDurationMs(12_000)).toBe(12_000);
    expect(clampDurationMs(999_999)).toBe(MAX_REVIEW_DURATION_MS);
    expect(MAX_REVIEW_DURATION_MS).toBe(300_000);
  });

  it('arredonda e trata valores invalidos', () => {
    expect(clampDurationMs(1234.6)).toBe(1235);
    expect(clampDurationMs(Number.NaN)).toBe(0);
  });
});

describe('tempo estimado', () => {
  it('sem historico usa 40 s por card', () => {
    expect(averageMsPerCard([])).toBe(DEFAULT_MS_PER_CARD);
    expect(DEFAULT_MS_PER_CARD).toBe(40_000);
  });

  it('usa a media das avaliacoes recentes', () => {
    expect(averageMsPerCard([30_000, 50_000, 25_000])).toBeCloseTo(35_000);
  });

  it('cards x media, arredondado para minutos', () => {
    expect(estimatedMinutes(20, 40_000)).toBe(13); // 13,3 min ("~13 min" na tela)
    expect(estimatedMinutes(32, 37_500)).toBe(20);
    expect(estimatedMinutes(3, 50_000)).toBe(3); // 2,5 -> 3
  });

  it('zero cards = 0 min; com cards, no minimo 1 min', () => {
    expect(estimatedMinutes(0, 40_000)).toBe(0);
    expect(estimatedMinutes(1, 10_000)).toBe(1);
  });
});
