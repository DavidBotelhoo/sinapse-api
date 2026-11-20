import { dayIndexOf } from '../../common/time/user-day';

// Agenda de revisao: CardState.due agrupado por dia local. Vencidos de dias anteriores
// contam em "Hoje", marcados como atrasados.

export interface DueItem {
  deckId: string;
  due: Date;
}

export interface AgendaDayCount {
  total: number;
  overdue: number; // so no dia 0 (hoje)
}

// `boundaries` = fronteiras dos dias a partir de hoje (localDayBoundaries(now, days, tz)).
export function countDuePerDay(dues: readonly DueItem[], boundaries: Date[]): AgendaDayCount[] {
  const out: AgendaDayCount[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) out.push({ total: 0, overdue: 0 });
  if (out.length === 0) return out;

  const startToday = boundaries[0]!.getTime();
  for (const item of dues) {
    if (item.due.getTime() < startToday) {
      out[0]!.total += 1;
      out[0]!.overdue += 1;
      continue;
    }
    const idx = dayIndexOf(item.due, boundaries);
    if (idx >= 0) out[idx]!.total += 1;
  }
  return out;
}

export interface AgendaDeckCount {
  deckId: string;
  dueOnDay: number; // vencem no dia escolhido
  overdue: number; // so quando o dia escolhido e hoje
  total: number;
  oldestOverdue: Date | null;
}

// Por deck, no dia [dayStart, dayEnd). Em "hoje", os vencidos antes de hoje entram como atrasados.
export function countDuePerDeck(
  dues: readonly DueItem[],
  dayStart: Date,
  dayEnd: Date,
  isToday: boolean,
): AgendaDeckCount[] {
  const byDeck = new Map<string, AgendaDeckCount>();
  const start = dayStart.getTime();
  const end = dayEnd.getTime();

  for (const item of dues) {
    const t = item.due.getTime();
    const overdue = isToday && t < start;
    const inDay = t >= start && t < end;
    if (!overdue && !inDay) continue;

    let entry = byDeck.get(item.deckId);
    if (!entry) {
      entry = { deckId: item.deckId, dueOnDay: 0, overdue: 0, total: 0, oldestOverdue: null };
      byDeck.set(item.deckId, entry);
    }
    entry.total += 1;
    if (overdue) {
      entry.overdue += 1;
      if (!entry.oldestOverdue || t < entry.oldestOverdue.getTime()) entry.oldestOverdue = item.due;
    } else {
      entry.dueOnDay += 1;
    }
  }

  // Atrasados primeiro (em coral na tela), depois os com mais cards.
  return [...byDeck.values()].sort(
    (a, b) => b.overdue - a.overdue || b.total - a.total || a.deckId.localeCompare(b.deckId),
  );
}
