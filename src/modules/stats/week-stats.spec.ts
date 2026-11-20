import { ReviewRating } from '../../generated/prisma/enums';
import { computeWeekStats, weekStatsWindowStart, type ReviewPoint } from './week-stats';

const SP = 'America/Sao_Paulo';
const r = (iso: string, rating: ReviewRating, durationMs = 60_000): ReviewPoint => ({
  reviewedAt: new Date(iso),
  rating,
  durationMs,
});

describe('computeWeekStats', () => {
  // Quarta-feira, 18/11/2026, 12:00 em SP. Semana: seg 16 (03:00Z) a dom 22.
  const now = new Date('2026-11-18T15:00:00Z');

  const reviews: ReviewPoint[] = [
    // Semana atual
    r('2026-11-16T13:00:00Z', ReviewRating.GOOD, 60_000), // seg 10:00
    r('2026-11-17T02:30:00Z', ReviewRating.AGAIN, 30_000), // seg 23:30 em SP (ter em UTC)
    r('2026-11-18T11:00:00Z', ReviewRating.HARD, 120_000), // qua 08:00
    // Semana anterior
    r('2026-11-09T15:00:00Z', ReviewRating.GOOD), // seg 9
    r('2026-11-10T15:00:00Z', ReviewRating.GOOD), // ter 10
    r('2026-11-12T15:00:00Z', ReviewRating.GOOD), // qui 12: depois do "mesmo periodo"
    r('2026-11-16T01:00:00Z', ReviewRating.GOOD), // dom 15 22:00 em SP (seg em UTC)
  ];

  const stats = computeWeekStats(reviews, SP, now);

  it('semana de segunda a domingo no fuso do usuario', () => {
    expect(stats.weekStart).toBe('2026-11-16');
    expect(stats.weekStudied).toEqual([true, false, true, false, false, false, false]);
  });

  it('cards estudados na semana e variacao contra o mesmo periodo da semana anterior', () => {
    expect(stats.cardsThisWeek).toBe(3);
    // Semana anterior ate qua 12:00: seg 9 e ter 10 -> 2. (3 - 2) / 2 = 50%.
    expect(stats.cardsDeltaPct).toBe(50);
  });

  it('minutos por dia e na semana', () => {
    expect(stats.minutesPerDay).toEqual([2, 0, 2, 0, 0, 0, 0]); // 1,5 min -> 2; 2 min
    expect(stats.minutesThisWeek).toBe(4); // 3,5 min -> 4
  });

  it('taxa de acerto dos ultimos 7 dias (hoje e os 6 anteriores)', () => {
    // De qui 12 00:00 local em diante: GOOD (qui 12), GOOD (dom 15), GOOD, AGAIN, HARD -> 4/5.
    expect(stats.accuracy7d).toBe(80);
  });

  it('sem semana anterior, a variacao e null; sem avaliacoes, a taxa e null', () => {
    const empty = computeWeekStats([], SP, now);
    expect(empty.cardsThisWeek).toBe(0);
    expect(empty.cardsDeltaPct).toBeNull();
    expect(empty.accuracy7d).toBeNull();
    expect(empty.minutesPerDay).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('domingo a noite ainda e a mesma semana', () => {
    const sundayNight = new Date('2026-11-23T02:00:00Z'); // dom 22, 23:00 em SP
    const s = computeWeekStats([r('2026-11-23T01:00:00Z', ReviewRating.GOOD)], SP, sundayNight);
    expect(s.weekStart).toBe('2026-11-16');
    expect(s.weekStudied[6]).toBe(true);
  });

  it('janela de busca comeca na segunda-feira da semana anterior', () => {
    expect(weekStatsWindowStart(SP, now).toISOString()).toBe('2026-11-09T03:00:00.000Z');
  });
});
