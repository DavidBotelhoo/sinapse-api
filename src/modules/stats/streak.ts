// Streak: dias seguidos (no fuso do usuario) com ao menos uma avaliacao, contando para tras
// a partir de hoje. Se hoje ainda nao tem avaliacao, comeca de ontem: a sequencia so quebra
// quando o dia acaba.
//
// Trabalha com datas locais "YYYY-MM-DD" ja convertidas para o fuso do usuario.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d) + deltaDays * MS_PER_DAY).toISOString().slice(0, 10);
}

export interface StreakResult {
  days: number;
  studiedToday: boolean;
}

export function computeStreak(studiedDays: Iterable<string>, todayKey: string): StreakResult {
  const days = new Set(studiedDays);
  const studiedToday = days.has(todayKey);
  let cursor = studiedToday ? todayKey : shiftDateKey(todayKey, -1);
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return { days: count, studiedToday };
}
