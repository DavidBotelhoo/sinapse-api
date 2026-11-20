import {
  addLocalDays,
  dayIndexOf,
  daysBetween,
  isValidTimezone,
  localDateKey,
  localDayBoundaries,
  localWeekdayMonday0,
  startOfLocalDateUtc,
  startOfTodayUtc,
  startOfTomorrowUtc,
  startOfWeekUtc,
} from './user-day';

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

  it('localDateKey usa a data local (23:30 em SP ainda e o dia anterior em UTC+0)', () => {
    const instant = new Date('2026-11-17T02:30:00Z'); // 23:30 do dia 16 em SP
    expect(localDateKey(instant, 'America/Sao_Paulo')).toBe('2026-11-16');
    expect(localDateKey(instant, 'UTC')).toBe('2026-11-17');
  });

  it('startOfLocalDateUtc e o inverso de localDateKey', () => {
    expect(startOfLocalDateUtc('2026-11-16', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-11-16T03:00:00.000Z',
    );
  });

  it('semana comeca na segunda-feira local', () => {
    // 2026-11-15 e domingo; 2026-11-16 e segunda.
    const domingoNoite = new Date('2026-11-16T02:00:00Z'); // 23:00 de domingo (15) em SP
    expect(localWeekdayMonday0(domingoNoite, 'America/Sao_Paulo')).toBe(6);
    expect(startOfWeekUtc('America/Sao_Paulo', domingoNoite).toISOString()).toBe(
      '2026-11-09T03:00:00.000Z',
    );
    // Em UTC o mesmo instante ja e segunda.
    expect(startOfWeekUtc('UTC', domingoNoite).toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });

  it('addLocalDays atravessa o horario de verao (dia de 23h em New York)', () => {
    // DST comeca em 2026-03-08 nos EUA: meia-noite local muda de UTC-5 para UTC-4.
    const sabado = new Date('2026-03-07T12:00:00Z');
    expect(addLocalDays(sabado, 1, 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    );
    expect(addLocalDays(sabado, 2, 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    );
  });

  it('localDayBoundaries + dayIndexOf colocam cada instante no dia local certo', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    const b = localDayBoundaries(now, 3, 'America/Sao_Paulo');
    expect(b.map((d) => d.toISOString())).toEqual([
      '2026-11-16T03:00:00.000Z',
      '2026-11-17T03:00:00.000Z',
      '2026-11-18T03:00:00.000Z',
      '2026-11-19T03:00:00.000Z',
    ]);
    expect(dayIndexOf(new Date('2026-11-16T03:00:00Z'), b)).toBe(0);
    expect(dayIndexOf(new Date('2026-11-17T02:59:59Z'), b)).toBe(0);
    expect(dayIndexOf(new Date('2026-11-17T03:00:00Z'), b)).toBe(1);
    expect(dayIndexOf(new Date('2026-11-16T02:00:00Z'), b)).toBe(-1);
    expect(dayIndexOf(new Date('2026-11-19T03:00:00Z'), b)).toBe(-1);
  });

  it('isValidTimezone', () => {
    expect(isValidTimezone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimezone('Mars/Base')).toBe(false);
  });
});
