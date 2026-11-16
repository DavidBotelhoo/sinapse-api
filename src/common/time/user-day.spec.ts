import { daysBetween, startOfTodayUtc, startOfTomorrowUtc } from './user-day';

describe('user-day helpers', () => {
  // America/Sao_Paulo esta em UTC-3 (sem DST desde 2019).
  it('startOfTodayUtc em America/Sao_Paulo e 03:00 UTC do mesmo dia', () => {
    const now = new Date('2026-11-16T18:30:00Z'); // 15:30 local SP
    const start = startOfTodayUtc('America/Sao_Paulo', now);
    expect(start.toISOString()).toBe('2026-11-16T03:00:00.000Z');
  });

  it('startOfTodayUtc em America/Sao_Paulo antes das 03:00 UTC ainda e o dia anterior local', () => {
    const now = new Date('2026-11-16T02:30:00Z'); // 23:30 local do dia 15
    const start = startOfTodayUtc('America/Sao_Paulo', now);
    expect(start.toISOString()).toBe('2026-11-15T03:00:00.000Z');
  });

  it('startOfTomorrowUtc soma 1 dia local', () => {
    const now = new Date('2026-11-16T18:30:00Z');
    const start = startOfTomorrowUtc('America/Sao_Paulo', now);
    expect(start.toISOString()).toBe('2026-11-17T03:00:00.000Z');
  });

  it('daysBetween em America/Sao_Paulo trata virada local corretamente', () => {
    const now = new Date('2026-11-16T04:00:00Z'); // 01:00 do dia 16 local
    const due = new Date('2026-11-17T02:00:00Z'); // 23:00 do dia 16 local
    // Mesma data local -> 0 dias.
    expect(daysBetween(now, due, 'America/Sao_Paulo')).toBe(0);

    const dueManha = new Date('2026-11-17T12:00:00Z'); // 09:00 do dia 17 local
    expect(daysBetween(now, dueManha, 'America/Sao_Paulo')).toBe(1);

    const passado = new Date('2026-11-15T12:00:00Z');
    expect(daysBetween(now, passado, 'America/Sao_Paulo')).toBe(-1);
  });

  it('funciona com UTC', () => {
    const now = new Date('2026-11-16T15:00:00Z');
    expect(startOfTodayUtc('UTC', now).toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(startOfTomorrowUtc('UTC', now).toISOString()).toBe('2026-11-17T00:00:00.000Z');
  });
});
