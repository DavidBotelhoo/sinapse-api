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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Criar um Intl.DateTimeFormat e caro; guardamos um por fuso.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timezone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timezone, fmt);
  }
  return fmt;
}

function partsInZone(instant: Date, timezone: string): ZoneParts {
  const fmt = formatterFor(timezone);
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
  return addLocalDays(today, 1, timezone);
}

// Dias (inteiro) entre now e due no fuso. 0 = mesmo dia local, 1 = amanha, -1 = ontem.
export function daysBetween(nowUtc: Date, dueUtc: Date, timezone: string): number {
  const nowStart = startOfDayUtcFor(nowUtc, timezone).getTime();
  const dueStart = startOfDayUtcFor(dueUtc, timezone).getTime();
  return Math.round((dueStart - nowStart) / MS_PER_DAY);
}

// Inicio (UTC) do dia local que fica `days` dias depois do dia que contem `instant`.
// Re-ancora pela data local, entao cobre dias de 23h ou 25h (horario de verao).
export function addLocalDays(instant: Date, days: number, timezone: string): Date {
  const { y, m, d } = partsInZone(instant, timezone);
  return utcForLocalMidnight(y, m, d + days, timezone);
}

// "YYYY-MM-DD" do dia local que contem `instant`.
export function localDateKey(instant: Date, timezone: string): string {
  const { y, m, d } = partsInZone(instant, timezone);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Inicio (UTC) do dia local dado como "YYYY-MM-DD".
export function startOfLocalDateUtc(dateKey: string, timezone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  return utcForLocalMidnight(y, m, d, timezone);
}

// Dia da semana local: 0 = segunda ... 6 = domingo.
export function localWeekdayMonday0(instant: Date, timezone: string): number {
  const { y, m, d } = partsInZone(instant, timezone);
  const sunday0 = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (sunday0 + 6) % 7;
}

// Inicio (UTC) da segunda-feira da semana local que contem `now`. Semana de segunda a domingo.
export function startOfWeekUtc(timezone: string, now: Date = new Date()): Date {
  return addLocalDays(now, -localWeekdayMonday0(now, timezone), timezone);
}

// `count + 1` fronteiras de dias locais a partir do dia que contem `from`:
// [inicio do dia 0, inicio do dia 1, ..., inicio do dia `count`]. O dia i e [b[i], b[i+1]).
export function localDayBoundaries(from: Date, count: number, timezone: string): Date[] {
  const out: Date[] = [];
  for (let i = 0; i <= count; i++) {
    out.push(addLocalDays(from, i, timezone));
  }
  return out;
}

// Indice do dia (0..n-1) em que `instant` cai, dadas as fronteiras; -1 se estiver fora.
export function dayIndexOf(instant: Date, boundaries: Date[]): number {
  const t = instant.getTime();
  if (boundaries.length < 2 || t < boundaries[0]!.getTime()) return -1;
  for (let i = 0; i < boundaries.length - 1; i++) {
    if (t < boundaries[i + 1]!.getTime()) return i;
  }
  return -1;
}

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

// Fuso salvo no perfil, ou o padrao se estiver invalido (protege Intl e o AT TIME ZONE do Postgres).
export function resolveTimezone(timezone: string | null | undefined): string {
  return timezone && isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
}

// Fuso IANA valido? (Intl lanca RangeError para fuso desconhecido.)
export function isValidTimezone(timezone: string): boolean {
  try {
    formatterFor(timezone);
    return true;
  } catch {
    return false;
  }
}
