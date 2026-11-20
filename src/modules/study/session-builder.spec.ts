import { CardLearningState, StudyOrder } from '../../generated/prisma/enums';
import {
  buildSessionQueue,
  classifyForSession,
  shuffled,
  type BuildSessionOptions,
  type SessionCandidate,
} from './session-builder';

// Hoje em America/Sao_Paulo = [2026-11-16T03:00Z, 2026-11-17T03:00Z)
const window = {
  startToday: new Date('2026-11-16T03:00:00Z'),
  startTomorrow: new Date('2026-11-17T03:00:00Z'),
};

function review(due: string, state: CardLearningState = CardLearningState.REVIEW) {
  return { state, due: new Date(due) };
}

function card(
  cardId: string,
  state: SessionCandidate['state'],
  opts: { deckId?: string; deckRank?: number; position?: number } = {},
): SessionCandidate {
  return {
    cardId,
    deckId: opts.deckId ?? 'deck-a',
    deckRank: opts.deckRank ?? 0,
    position: opts.position ?? 1,
    state,
  };
}

// Gerador deterministico (LCG) para os testes de SHUFFLE.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const opts = (over: Partial<BuildSessionOptions> = {}): BuildSessionOptions => ({
  window,
  order: StudyOrder.DUE_FIRST,
  limit: null,
  includeNew: true,
  ...over,
});

describe('classifyForSession', () => {
  it('novo, atrasado, hoje e futuro', () => {
    expect(classifyForSession(card('n', null), window)).toBe('NEW');
    expect(
      classifyForSession(card('n2', review('2026-11-20T00:00:00Z', CardLearningState.NEW)), window),
    ).toBe('NEW');
    expect(classifyForSession(card('o', review('2026-11-16T02:59:59Z')), window)).toBe('OVERDUE');
    expect(classifyForSession(card('t', review('2026-11-16T03:00:00Z')), window)).toBe('DUE_TODAY');
    expect(classifyForSession(card('t2', review('2026-11-17T02:59:59Z')), window)).toBe(
      'DUE_TODAY',
    );
    expect(classifyForSession(card('f', review('2026-11-17T03:00:00Z')), window)).toBeNull();
  });
});

describe('buildSessionQueue: ordem DUE_FIRST', () => {
  const candidates: SessionCandidate[] = [
    card('new-b-1', null, { deckId: 'deck-b', deckRank: 1, position: 1 }),
    card('today-late', review('2026-11-16T20:00:00Z')),
    card('new-a-2', null, { deckId: 'deck-a', deckRank: 0, position: 2 }),
    card('overdue-recent', review('2026-11-15T12:00:00Z')),
    card('future', review('2026-11-25T12:00:00Z')),
    card('mastered-not-due', {
      state: CardLearningState.REVIEW,
      due: new Date('2026-12-30T12:00:00Z'),
    }),
    card('today-early', review('2026-11-16T10:00:00Z', CardLearningState.LEARNING)),
    card('new-a-1', null, { deckId: 'deck-a', deckRank: 0, position: 1 }),
    card('overdue-oldest', review('2026-11-01T12:00:00Z', CardLearningState.RELEARNING)),
  ];

  it('atrasados (mais antigos primeiro), depois os de hoje, depois os novos na ordem do deck', () => {
    const queue = buildSessionQueue(candidates, opts());
    expect(queue.map((q) => q.cardId)).toEqual([
      'overdue-oldest',
      'overdue-recent',
      'today-early',
      'today-late',
      'new-a-1',
      'new-a-2',
      'new-b-1',
    ]);
    expect(queue.map((q) => q.status)).toEqual([
      'OVERDUE',
      'OVERDUE',
      'DUE_TODAY',
      'DUE_TODAY',
      'NEW',
      'NEW',
      'NEW',
    ]);
  });

  it('deixa de fora os agendados para depois de hoje (inclusive dominados que nao venceram)', () => {
    const ids = buildSessionQueue(candidates, opts()).map((q) => q.cardId);
    expect(ids).not.toContain('future');
    expect(ids).not.toContain('mastered-not-due');
  });

  it('modo "hoje" (includeNew=false) traz so atrasados e os de hoje', () => {
    const ids = buildSessionQueue(candidates, opts({ includeNew: false })).map((q) => q.cardId);
    expect(ids).toEqual(['overdue-oldest', 'overdue-recent', 'today-early', 'today-late']);
  });

  it('um card que vem por deck e por materia aparece uma vez so', () => {
    const dup = [...candidates, card('today-late', review('2026-11-16T20:00:00Z'))];
    const ids = buildSessionQueue(dup, opts()).map((q) => q.cardId);
    expect(ids.filter((id) => id === 'today-late')).toHaveLength(1);
  });

  it('sem nada pendente nem novo, a fila fica vazia', () => {
    const onlyFuture = [card('f1', review('2026-11-25T12:00:00Z'))];
    expect(buildSessionQueue(onlyFuture, opts())).toEqual([]);
  });
});

describe('buildSessionQueue: limite', () => {
  // 5 atrasados + 40 novos
  const pool: SessionCandidate[] = [
    ...Array.from({ length: 40 }, (_, i) =>
      card(`new-${String(i).padStart(2, '0')}`, null, { position: i + 1 }),
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      card(`overdue-${i}`, review(`2026-11-0${i + 1}T12:00:00Z`)),
    ),
  ];

  it.each([
    [10, 10],
    [20, 20],
    [30, 30],
    [null, 45],
  ])('limit=%s -> %i cards', (limit, expected) => {
    const queue = buildSessionQueue(pool, opts({ limit }));
    expect(queue).toHaveLength(expected);
    // Os atrasados sempre entram antes do corte.
    expect(queue.slice(0, 5).every((q) => q.status === 'OVERDUE')).toBe(true);
  });

  it('limite maior que o que existe devolve tudo', () => {
    expect(buildSessionQueue(pool.slice(0, 3), opts({ limit: 30 }))).toHaveLength(3);
  });
});

describe('buildSessionQueue: ordem SHUFFLE', () => {
  const pool: SessionCandidate[] = [
    ...Array.from({ length: 25 }, (_, i) =>
      card(`new-${String(i).padStart(2, '0')}`, null, { position: i + 1 }),
    ),
    ...Array.from({ length: 8 }, (_, i) => card(`today-${i}`, review(`2026-11-16T1${i}:00:00Z`))),
    ...Array.from({ length: 4 }, (_, i) =>
      card(`overdue-${i}`, review(`2026-11-0${i + 1}T12:00:00Z`)),
    ),
  ];

  it('mesmos cards que DUE_FIRST (escolhe pela prioridade, corta, depois embaralha)', () => {
    const dueFirst = buildSessionQueue(pool, opts({ limit: 20 }));
    const shuffledQueue = buildSessionQueue(
      pool,
      opts({ limit: 20, order: StudyOrder.SHUFFLE, random: seeded(42) }),
    );
    expect(shuffledQueue).toHaveLength(20);
    expect(new Set(shuffledQueue.map((q) => q.cardId))).toEqual(
      new Set(dueFirst.map((q) => q.cardId)),
    );
    // Nenhum atrasado ou de hoje fica de fora por causa do embaralhamento.
    const ids = shuffledQueue.map((q) => q.cardId);
    for (let i = 0; i < 4; i++) expect(ids).toContain(`overdue-${i}`);
    for (let i = 0; i < 8; i++) expect(ids).toContain(`today-${i}`);
  });

  it('a ordem muda', () => {
    const dueFirst = buildSessionQueue(pool, opts({ limit: 20 })).map((q) => q.cardId);
    const mixed = buildSessionQueue(
      pool,
      opts({ limit: 20, order: StudyOrder.SHUFFLE, random: seeded(7) }),
    ).map((q) => q.cardId);
    expect(mixed).not.toEqual(dueFirst);
  });

  it('shuffled e uma permutacao e nao altera a entrada', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffled(input, seeded(1));
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
  });
});
