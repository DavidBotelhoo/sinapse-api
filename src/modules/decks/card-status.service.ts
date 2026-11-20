import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { daysBetween, startOfTodayUtc, startOfTomorrowUtc } from '../../common/time/user-day';
import { CardLearningState } from '../../generated/prisma/enums';

export type CardStatus = 'NEW' | 'DUE_TODAY' | 'OVERDUE' | 'SCHEDULED' | 'MASTERED';

export interface CardStatusResult {
  status: CardStatus;
  dueInDays: number | null; // so quando SCHEDULED
}

export interface CardStateInput {
  state: CardLearningState;
  due: Date;
  scheduledDays: number;
}

export interface DeckStats {
  cardCount: number;
  newCount: number;
  dueToday: number;
  overdue: number;
  masteredCount: number;
  masteryPct: number;
}

const MASTERY_THRESHOLD_DAYS = 21;

// Dominado: em revisao e com intervalo de 21 dias ou mais.
export function isMastered(state: { state: CardLearningState; scheduledDays: number }): boolean {
  return state.state === CardLearningState.REVIEW && state.scheduledDays >= MASTERY_THRESHOLD_DAYS;
}

@Injectable()
export class CardStatusService {
  constructor(private readonly prisma: PrismaService) {}

  computeStatus(
    state: CardStateInput | null,
    timezone: string,
    now: Date = new Date(),
  ): CardStatusResult {
    if (!state || state.state === CardLearningState.NEW) {
      return { status: 'NEW', dueInDays: null };
    }

    // Ordem do docs/dominio.md: vencido (atrasado ou hoje) vem antes de dominado. Um card
    // dominado que venceu precisa voltar para a revisao.
    const startToday = startOfTodayUtc(timezone, now);
    const startTomorrow = startOfTomorrowUtc(timezone, now);
    const dueMs = state.due.getTime();

    if (dueMs < startToday.getTime()) {
      return { status: 'OVERDUE', dueInDays: null };
    }
    if (dueMs < startTomorrow.getTime()) {
      return { status: 'DUE_TODAY', dueInDays: null };
    }
    if (isMastered(state)) {
      return { status: 'MASTERED', dueInDays: null };
    }
    return { status: 'SCHEDULED', dueInDays: daysBetween(now, state.due, timezone) };
  }

  // Estatisticas agregadas por deck pra um conjunto de deckIds.
  async deckStatsFor(
    userId: string,
    deckIds: string[],
    timezone: string,
    now: Date = new Date(),
  ): Promise<Map<string, DeckStats>> {
    if (deckIds.length === 0) {
      return new Map();
    }

    const decks = await this.prisma.deck.findMany({
      where: { id: { in: deckIds } },
      select: { id: true, cardCount: true },
    });
    const cardCountByDeck = new Map(decks.map((d) => [d.id, d.cardCount]));

    // Cards excluidos (soft delete) nao contam, mesmo que o usuario tenha estado de revisao.
    const states = await this.prisma.cardState.findMany({
      where: { userId, deckId: { in: deckIds }, card: { deletedAt: null } },
      select: { deckId: true, state: true, due: true, scheduledDays: true },
    });

    const startToday = startOfTodayUtc(timezone, now).getTime();
    const startTomorrow = startOfTomorrowUtc(timezone, now).getTime();

    const stats = new Map<string, DeckStats>();
    for (const id of deckIds) {
      stats.set(id, {
        cardCount: cardCountByDeck.get(id) ?? 0,
        newCount: cardCountByDeck.get(id) ?? 0, // comeca com todos; subtrai abaixo
        dueToday: 0,
        overdue: 0,
        masteredCount: 0,
        masteryPct: 0,
      });
    }

    for (const st of states) {
      const bucket = stats.get(st.deckId);
      if (!bucket) continue;
      if (st.state === CardLearningState.NEW) {
        continue; // continua contando como novo
      }
      bucket.newCount = Math.max(0, bucket.newCount - 1);

      // Mesma ordem de computeStatus: vencido antes de dominado.
      const dueMs = st.due.getTime();
      if (dueMs < startToday) {
        bucket.overdue += 1;
      } else if (dueMs < startTomorrow) {
        bucket.dueToday += 1;
      } else if (isMastered(st)) {
        bucket.masteredCount += 1;
      }
    }

    for (const bucket of stats.values()) {
      bucket.masteryPct =
        bucket.cardCount > 0 ? Math.round((bucket.masteredCount * 100) / bucket.cardCount) : 0;
    }

    return stats;
  }

  // Status card-a-card para listagens de cards.
  async cardStatusesFor(
    userId: string,
    cardIds: string[],
    timezone: string,
    now: Date = new Date(),
  ): Promise<Map<string, CardStatusResult>> {
    if (cardIds.length === 0) {
      return new Map();
    }
    const states = await this.prisma.cardState.findMany({
      where: { userId, cardId: { in: cardIds } },
      select: { cardId: true, state: true, due: true, scheduledDays: true },
    });
    const byCard = new Map(states.map((s) => [s.cardId, s]));

    const out = new Map<string, CardStatusResult>();
    for (const id of cardIds) {
      const st = byCard.get(id) ?? null;
      out.set(id, this.computeStatus(st, timezone, now));
    }
    return out;
  }

  // Contagens por aba (all, due, new, mastered) de um deck inteiro — usado em GET /decks/:id/cards.
  async deckCardCounts(
    userId: string,
    deckId: string,
    timezone: string,
    now: Date = new Date(),
  ): Promise<{ all: number; due: number; new: number; mastered: number }> {
    const [stats] = await Promise.all([this.deckStatsFor(userId, [deckId], timezone, now)]);
    const s = stats.get(deckId);
    if (!s) {
      return { all: 0, due: 0, new: 0, mastered: 0 };
    }
    return {
      all: s.cardCount,
      due: s.dueToday + s.overdue,
      new: s.newCount,
      mastered: s.masteredCount,
    };
  }
}

export { MASTERY_THRESHOLD_DAYS };
