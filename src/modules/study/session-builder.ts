import { CardLearningState, StudyOrder } from '../../generated/prisma/enums';

// Montagem da sessao (docs/dominio.md > Calculos):
// - entram os atrasados, os que vencem hoje e (fora do modo "hoje") os novos;
// - DUE_FIRST: atrasados (mais antigos primeiro), depois os de hoje, depois os novos na ordem do deck;
// - corta em `limit`;
// - SHUFFLE: os mesmos cards escolhidos acima, embaralhados.
// Cards agendados para depois de hoje (inclusive dominados que nao venceram) ficam de fora.

export type SessionCardStatus = 'OVERDUE' | 'DUE_TODAY' | 'NEW';

export interface SessionCandidate {
  cardId: string;
  deckId: string;
  position: number; // posicao do card no deck
  deckRank: number; // ordem do deck na selecao (menor primeiro)
  state: { state: CardLearningState; due: Date } | null; // null = nunca estudado
}

export interface DayWindow {
  startToday: Date;
  startTomorrow: Date;
}

export interface BuildSessionOptions {
  window: DayWindow;
  order: StudyOrder;
  limit: number | null; // null = todos
  includeNew: boolean;
  random?: () => number; // injetavel para teste
}

export interface QueuedCard {
  cardId: string;
  deckId: string;
  status: SessionCardStatus;
}

export function classifyForSession(
  candidate: SessionCandidate,
  window: DayWindow,
): SessionCardStatus | null {
  const st = candidate.state;
  if (!st || st.state === CardLearningState.NEW) return 'NEW';
  const due = st.due.getTime();
  if (due < window.startToday.getTime()) return 'OVERDUE';
  if (due < window.startTomorrow.getTime()) return 'DUE_TODAY';
  return null;
}

function byDeckOrder(a: SessionCandidate, b: SessionCandidate): number {
  return a.deckRank - b.deckRank || a.position - b.position || a.cardId.localeCompare(b.cardId);
}

function byDue(a: SessionCandidate, b: SessionCandidate): number {
  return a.state!.due.getTime() - b.state!.due.getTime() || byDeckOrder(a, b);
}

// Fisher-Yates em uma copia.
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function buildSessionQueue(
  candidates: readonly SessionCandidate[],
  options: BuildSessionOptions,
): QueuedCard[] {
  const overdue: SessionCandidate[] = [];
  const dueToday: SessionCandidate[] = [];
  const fresh: SessionCandidate[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    if (seen.has(c.cardId)) continue; // um card pode vir por deck e por materia
    seen.add(c.cardId);
    const status = classifyForSession(c, options.window);
    if (status === 'OVERDUE') overdue.push(c);
    else if (status === 'DUE_TODAY') dueToday.push(c);
    else if (status === 'NEW' && options.includeNew) fresh.push(c);
  }

  overdue.sort(byDue);
  dueToday.sort(byDue);
  fresh.sort(byDeckOrder);

  const prioritized: QueuedCard[] = [
    ...overdue.map((c) => ({ cardId: c.cardId, deckId: c.deckId, status: 'OVERDUE' as const })),
    ...dueToday.map((c) => ({ cardId: c.cardId, deckId: c.deckId, status: 'DUE_TODAY' as const })),
    ...fresh.map((c) => ({ cardId: c.cardId, deckId: c.deckId, status: 'NEW' as const })),
  ];

  const picked = options.limit === null ? prioritized : prioritized.slice(0, options.limit);
  return options.order === StudyOrder.SHUFFLE ? shuffled(picked, options.random) : picked;
}
