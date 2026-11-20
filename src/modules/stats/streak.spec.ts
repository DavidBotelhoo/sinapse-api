import { localDateKey } from '../../common/time/user-day';
import { computeStreak, shiftDateKey } from './streak';

// O servico converte cada avaliacao para a data local (no Postgres, com AT TIME ZONE).
// Aqui fazemos a mesma conversao com localDateKey para testar fuso e virada de dia.
function streakAt(reviewInstants: string[], timezone: string, now: string) {
  const days = reviewInstants.map((iso) => localDateKey(new Date(iso), timezone));
  return computeStreak(days, localDateKey(new Date(now), timezone));
}

describe('shiftDateKey', () => {
  it('atravessa mes e ano', () => {
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateKey('2027-01-01', -1)).toBe('2026-12-31');
    expect(shiftDateKey('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('computeStreak', () => {
  it('sem avaliacoes = 0', () => {
    expect(computeStreak([], '2026-11-16')).toEqual({ days: 0, studiedToday: false });
  });

  it('conta dias seguidos terminando hoje', () => {
    expect(computeStreak(['2026-11-16', '2026-11-15', '2026-11-14'], '2026-11-16')).toEqual({
      days: 3,
      studiedToday: true,
    });
  });

  it('se ainda nao estudou hoje, a sequencia ate ontem continua valendo', () => {
    expect(computeStreak(['2026-11-15', '2026-11-14'], '2026-11-16')).toEqual({
      days: 2,
      studiedToday: false,
    });
  });

  it('um dia sem avaliacao quebra a sequencia', () => {
    expect(computeStreak(['2026-11-16', '2026-11-14', '2026-11-13'], '2026-11-16').days).toBe(1);
    expect(computeStreak(['2026-11-14', '2026-11-13'], '2026-11-16').days).toBe(0);
  });

  it('dias repetidos e fora de ordem nao mudam o resultado', () => {
    expect(
      computeStreak(['2026-11-14', '2026-11-16', '2026-11-15', '2026-11-16'], '2026-11-16').days,
    ).toBe(3);
  });
});

describe('streak: virada de dia e fuso', () => {
  const SP = 'America/Sao_Paulo'; // UTC-3

  it('estudou so no dia 15: vale ate 23:59 do dia 16 e quebra a 00:00 do dia 17 (hora local)', () => {
    const reviews = ['2026-11-15T15:00:00Z'];
    expect(streakAt(reviews, SP, '2026-11-17T02:59:00Z')).toEqual({ days: 1, studiedToday: false }); // 23:59 do dia 16
    expect(streakAt(reviews, SP, '2026-11-17T03:01:00Z')).toEqual({ days: 0, studiedToday: false }); // 00:01 do dia 17
  });

  it('avaliacao as 23:30 em SP conta no dia local, nao no dia UTC', () => {
    const reviews = [
      '2026-11-15T12:00:00Z', // dia 15 nos dois fusos
      '2026-11-17T02:30:00Z', // 23:30 do dia 16 em SP; ja dia 17 em UTC
    ];
    const now = '2026-11-17T10:00:00Z'; // 07:00 do dia 17 em SP
    // SP: dias {15, 16}; hoje (17) ainda sem estudo -> 2 dias.
    expect(streakAt(reviews, SP, now)).toEqual({ days: 2, studiedToday: false });
    // UTC: dias {15, 17}; hoje (17) estudou, ontem (16) nao -> 1 dia.
    expect(streakAt(reviews, 'UTC', now)).toEqual({ days: 1, studiedToday: true });
  });

  it('logo depois da meia-noite local, a avaliacao ja conta no dia novo', () => {
    const reviews = ['2026-11-16T15:00:00Z', '2026-11-17T03:05:00Z']; // dia 16 e 00:05 do dia 17 em SP
    expect(streakAt(reviews, SP, '2026-11-17T03:10:00Z')).toEqual({ days: 2, studiedToday: true });
  });

  it('fuso a leste (Asia/Tokyo, UTC+9) vira o dia antes do UTC', () => {
    const reviews = ['2026-11-15T16:00:00Z']; // 01:00 do dia 16 em Toquio
    expect(streakAt(reviews, 'Asia/Tokyo', '2026-11-16T05:00:00Z')).toEqual({
      days: 1,
      studiedToday: true,
    });
    expect(streakAt(reviews, 'UTC', '2026-11-16T05:00:00Z')).toEqual({
      days: 1,
      studiedToday: false,
    });
  });
});
