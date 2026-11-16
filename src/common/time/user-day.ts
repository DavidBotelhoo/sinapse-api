// Helpers de data no fuso do usuario.

interface ZoneParts {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  s: number;
}

const DATE_FIELDS = new Set(['year', 'month', 'day', 'hour', 'minute', 'second']);

function partsInZone(instant: Date, timezone: string): ZoneParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (DATE_FIELDS.has(p.type)) {
      map[p.type] = p.value;
    }
  }
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    h: Number(map.hour),
    min: Number(map.minute),
    s: Number(map.second),
  };
}

// Dado (y, m, d) locais num fuso, devolve o instante UTC correspondente a 00:00 local.
function utcForLocalMidnight(y: number, m: number, d: number, timezone: string): Date {
  const targetLocalAsUtc = Date.UTC(y, m - 1, d);
  // Chutamos o instante e corrigimos pelo offset do fuso naquele instante (uma iteracao
  // cobre DST na maioria dos casos; duas iteracoes cobrem todos).
  let instant = new Date(targetLocalAsUtc);
  for (let i = 0; i < 3; i++) {
    const parts = partsInZone(instant, timezone);
    const localAsUtc = Date.UTC(parts.y, parts.m - 1, parts.d, parts.h, parts.min, parts.s);
    const offset = instant.getTime() - localAsUtc;
    const next = new Date(targetLocalAsUtc + offset);
    if (next.getTime() === instant.getTime()) {
      return next;
    }
    instant = next;
  }
  return instant;
}

// Instante UTC correspondente a 00:00 do dia que contem `instant` no fuso dado.
export function startOfDayUtcFor(instant: Date, timezone: string): Date {
  const { y, m, d } = partsInZone(instant, timezone);
  return utcForLocalMidnight(y, m, d, timezone);
}

export function startOfTodayUtc(timezone: string, now: Date = new Date()): Date {
  return startOfDayUtcFor(now, timezone);
}

export function startOfTomorrowUtc(timezone: string, now: Date = new Date()): Date {
  const today = startOfTodayUtc(timezone, now);
  // Soma 24h e re-ancora: cobre DST (23h ou 25h em dias de troca).
  const nextIsh = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return startOfDayUtcFor(nextIsh, timezone);
}

// Dias (inteiro) entre now e due no fuso. 0 = mesmo dia local, 1 = amanha, -1 = ontem.
export function daysBetween(nowUtc: Date, dueUtc: Date, timezone: string): number {
  const nowStart = startOfDayUtcFor(nowUtc, timezone).getTime();
  const dueStart = startOfDayUtcFor(dueUtc, timezone).getTime();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((dueStart - nowStart) / MS_PER_DAY);
}
