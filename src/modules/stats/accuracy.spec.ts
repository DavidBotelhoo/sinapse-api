import { accuracyPct } from './accuracy';

describe('taxa de acerto', () => {
  it('(Dificil + Facil) / total', () => {
    expect(accuracyPct({ again: 1, hard: 1, good: 2 })).toBe(75);
    expect(accuracyPct({ again: 4, hard: 6, good: 10 })).toBe(80);
  });

  it('arredonda para inteiro', () => {
    expect(accuracyPct({ again: 1, hard: 0, good: 2 })).toBe(67);
  });

  it('extremos', () => {
    expect(accuracyPct({ again: 3, hard: 0, good: 0 })).toBe(0);
    expect(accuracyPct({ again: 0, hard: 2, good: 5 })).toBe(100);
  });

  it('sem avaliacoes = null', () => {
    expect(accuracyPct({ again: 0, hard: 0, good: 0 })).toBeNull();
  });
});
