import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { startOfTodayUtc, startOfTomorrowUtc } from '../../common/time/user-day';
import { loadUserTimezone } from '../../common/time/user-timezone';
import type { Prisma } from '../../generated/prisma/client';
import { CardLearningState, ReviewRating, StudyOrder } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { CardStatusService, type CardStatus } from '../decks/card-status.service';
import { accessibleDeckWhere } from '../decks/deck-access';
import { accuracyPct } from '../stats/accuracy';
import { StatsService } from '../stats/stats.service';
import { StorageService } from '../storage/storage.service';
import { PUBLIC_OWNER_SELECT, toPublicOwner } from '../users/public-owner';
import {
  StudyMode,
  type CreateReviewDto,
  type CreateStudySessionDto,
  type ReviewResultDto,
  type StudyCardDto,
  type StudyDeckOptionDto,
  type StudyOverviewDto,
  type StudySessionDto,
  type StudySessionSummaryDto,
  type StudySubjectOptionDto,
} from './dto/study.dto';
import {
  averageMsPerCard,
  clampDurationMs,
  estimatedMinutes,
  ESTIMATE_SAMPLE_SIZE,
} from './estimate';
import { FsrsService } from './fsrs/fsrs.service';
import type { StoredCardState } from './fsrs/fsrs-mapping';
import { buildSessionQueue, shuffled, type SessionCandidate } from './session-builder';
import { sessionSubjects, type SubjectRef } from './session-subjects';

const DEFAULT_LIMIT = 20;

const SUBJECTS_SELECT = {
  select: { subject: { select: { id: true, slug: true, name: true } } },
} as const;

const CARD_FOR_SESSION_SELECT = {
  id: true,
  deckId: true,
  question: true,
  answer: true,
  deck: { select: { year: true, subjects: SUBJECTS_SELECT } },
} as const;

const COUNT_FIELD: Record<ReviewRating, 'againCount' | 'hardCount' | 'goodCount'> = {
  [ReviewRating.AGAIN]: 'againCount',
  [ReviewRating.HARD]: 'hardCount',
  [ReviewRating.GOOD]: 'goodCount',
};

interface SessionRow {
  id: string;
  userId: string;
  deckIds: string[];
  subjectIds: string[];
  cardLimit: number | null;
  order: StudyOrder;
  cardIds: string[];
  againCount: number;
  hardCount: number;
  goodCount: number;
  totalDurationMs: number;
  startedAt: Date;
  finishedAt: Date | null;
}

function notFound(code: string, message: string): AppException {
  return new AppException({ code, message, status: HttpStatus.NOT_FOUND });
}

const sessionNotFound = (): AppException =>
  notFound(ErrorCode.STUDY_SESSION_NOT_FOUND, 'Sessao de estudo nao encontrada.');

const nothingToStudy = (): AppException =>
  new AppException({
    code: ErrorCode.NOTHING_TO_STUDY,
    message: 'Nada para estudar agora nessa selecao. Os cards estao em dia.',
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  });

@Injectable()
export class StudyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cardStatus: CardStatusService,
    private readonly fsrs: FsrsService,
    private readonly stats: StatsService,
    private readonly storage: StorageService,
  ) {}

  // ----------------- GET /study/overview -----------------

  async overview(userId: string): Promise<StudyOverviewDto> {
    const now = new Date();
    const tz = await loadUserTimezone(this.prisma, userId);

    const decks = await this.prisma.deck.findMany({
      where: accessibleDeckWhere(userId),
      select: {
        id: true,
        name: true,
        year: true,
        cardCount: true,
        ownerId: true,
        owner: { select: PUBLIC_OWNER_SELECT },
        subjects: SUBJECTS_SELECT,
      },
    });

    const [statsByDeck, msPerCard] = await Promise.all([
      this.cardStatus.deckStatsFor(
        userId,
        decks.map((d) => d.id),
        tz,
        now,
      ),
      this.msPerCard(userId),
    ]);

    const deckOptions: StudyDeckOptionDto[] = [];
    const subjectOptions = new Map<string, StudySubjectOptionDto>();
    let dueToday = 0;
    let overdue = 0;
    let deckCount = 0;

    for (const deck of decks) {
      const st = statsByDeck.get(deck.id);
      const deckDue = st?.dueToday ?? 0;
      const deckOverdue = st?.overdue ?? 0;
      const deckNew = st?.newCount ?? deck.cardCount;
      dueToday += deckDue;
      overdue += deckOverdue;
      if (deckDue + deckOverdue > 0) deckCount += 1;

      const isMine = deck.ownerId === userId;
      deckOptions.push({
        id: deck.id,
        name: deck.name,
        year: deck.year,
        subjects: deck.subjects.map((s) => s.subject),
        cardCount: deck.cardCount,
        isMine,
        owner: isMine ? null : toPublicOwner(deck.owner, (k) => this.storage.publicUrl(k)),
        dueToday: deckDue,
        overdue: deckOverdue,
        newCount: deckNew,
      });

      for (const { subject } of deck.subjects) {
        let opt = subjectOptions.get(subject.id);
        if (!opt) {
          opt = { ...subject, years: [], cardCount: 0, dueToday: 0, overdue: 0, newCount: 0 };
          subjectOptions.set(subject.id, opt);
        }
        if (!opt.years.includes(deck.year)) opt.years.push(deck.year);
        opt.cardCount += deck.cardCount;
        opt.dueToday += deckDue;
        opt.overdue += deckOverdue;
        opt.newCount += deckNew;
      }
    }

    const pendingFirst = <T extends { name: string; dueToday: number; overdue: number }>(
      a: T,
      b: T,
    ): number =>
      b.overdue + b.dueToday - (a.overdue + a.dueToday) || a.name.localeCompare(b.name, 'pt-BR');

    const subjects = [...subjectOptions.values()].sort(pendingFirst);
    for (const s of subjects) s.years.sort((a, b) => a - b);

    return {
      today: {
        dueToday,
        overdue,
        deckCount,
        estimatedMinutes: estimatedMinutes(dueToday + overdue, msPerCard),
      },
      secondsPerCard: Math.round(msPerCard / 1000),
      subjects,
      decks: deckOptions.sort(pendingFirst),
    };
  }

  // ----------------- POST /study/sessions -----------------

  async createSession(userId: string, dto: CreateStudySessionDto): Promise<StudySessionDto> {
    const now = new Date();
    const tz = await loadUserTimezone(this.prisma, userId);
    const isToday = dto.mode === StudyMode.TODAY;
    const deckIds = [...new Set(dto.deckIds ?? [])];
    const subjectIds = [...new Set(dto.subjectIds ?? [])];

    if (isToday && (deckIds.length > 0 || subjectIds.length > 0)) {
      throw this.validation({
        mode: 'A revisao de hoje usa todos os decks; nao envie deckIds nem subjectIds.',
      });
    }
    if (!isToday && deckIds.length === 0 && subjectIds.length === 0) {
      throw this.validation({ deckIds: 'Escolha ao menos um deck ou uma materia.' });
    }

    const limit = dto.limit === undefined ? (isToday ? null : DEFAULT_LIMIT) : dto.limit;
    const order = dto.order ?? StudyOrder.DUE_FIRST;
    const window = {
      startToday: startOfTodayUtc(tz, now),
      startTomorrow: startOfTomorrowUtc(tz, now),
    };

    const deckRank = await this.resolveSessionDecks(userId, deckIds, subjectIds, isToday);
    const candidates = await this.loadCandidates(userId, deckRank, isToday, window.startTomorrow);

    const queue = buildSessionQueue(candidates, { window, order, limit, includeNew: !isToday });
    if (queue.length === 0) {
      throw nothingToStudy();
    }

    const session = await this.prisma.studySession.create({
      data: {
        userId,
        deckIds,
        subjectIds,
        cardLimit: limit,
        order,
        cardIds: queue.map((q) => q.cardId),
      },
    });

    const statusByCard = new Map<string, CardStatus>(queue.map((q) => [q.cardId, q.status]));
    return this.sessionPayload(session, statusByCard);
  }

  // Decks da selecao, com a ordem usada para os cards novos: primeiro os decks na ordem em que
  // foram escolhidos, depois os que vieram pelas materias, por nome.
  private async resolveSessionDecks(
    userId: string,
    deckIds: string[],
    subjectIds: string[],
    isToday: boolean,
  ): Promise<Map<string, number>> {
    const access = accessibleDeckWhere(userId);
    const rank = new Map<string, number>();

    if (isToday) {
      const all = await this.prisma.deck.findMany({
        where: access,
        select: { id: true },
        orderBy: { name: 'asc' },
      });
      all.forEach((d, i) => rank.set(d.id, i));
      return rank;
    }

    if (deckIds.length > 0) {
      const found = await this.prisma.deck.findMany({
        where: { AND: [access, { id: { in: deckIds } }] },
        select: { id: true },
      });
      if (found.length !== deckIds.length) {
        throw notFound(ErrorCode.DECK_NOT_FOUND, 'Deck nao encontrado.');
      }
      deckIds.forEach((id, i) => rank.set(id, i));
    }

    if (subjectIds.length > 0) {
      const bySubject = await this.prisma.deck.findMany({
        where: { AND: [access, { subjects: { some: { subjectId: { in: subjectIds } } } }] },
        select: { id: true },
        orderBy: { name: 'asc' },
      });
      for (const d of bySubject) {
        if (!rank.has(d.id)) rank.set(d.id, rank.size);
      }
    }
    return rank;
  }

  private async loadCandidates(
    userId: string,
    deckRank: Map<string, number>,
    isToday: boolean,
    startTomorrow: Date,
  ): Promise<SessionCandidate[]> {
    const deckIds = [...deckRank.keys()];
    if (deckIds.length === 0) return [];
    const rankOf = (deckId: string): number => deckRank.get(deckId) ?? Number.MAX_SAFE_INTEGER;

    if (isToday) {
      // Revisao de hoje: so o que ja venceu (sem novos), entao basta o CardState.
      const states = await this.prisma.cardState.findMany({
        where: {
          userId,
          deckId: { in: deckIds },
          state: { not: CardLearningState.NEW },
          due: { lt: startTomorrow },
          card: { deletedAt: null },
        },
        select: {
          cardId: true,
          deckId: true,
          state: true,
          due: true,
          card: { select: { position: true } },
        },
      });
      return states.map((s) => ({
        cardId: s.cardId,
        deckId: s.deckId,
        position: s.card.position,
        deckRank: rankOf(s.deckId),
        state: { state: s.state, due: s.due },
      }));
    }

    const [cards, states] = await Promise.all([
      this.prisma.card.findMany({
        where: { deckId: { in: deckIds }, deletedAt: null },
        select: { id: true, deckId: true, position: true },
      }),
      this.prisma.cardState.findMany({
        where: { userId, deckId: { in: deckIds }, card: { deletedAt: null } },
        select: { cardId: true, state: true, due: true },
      }),
    ]);
    const stateByCard = new Map(states.map((s) => [s.cardId, { state: s.state, due: s.due }]));
    return cards.map((c) => ({
      cardId: c.id,
      deckId: c.deckId,
      position: c.position,
      deckRank: rankOf(c.deckId),
      state: stateByCard.get(c.id) ?? null,
    }));
  }

  // ----------------- POST /study/sessions/:id/reviews -----------------

  async review(userId: string, sessionId: string, dto: CreateReviewDto): Promise<ReviewResultDto> {
    const now = new Date(); // relogio do servidor, nunca o do cliente
    const durationMs = clampDurationMs(dto.durationMs);
    const tz = await loadUserTimezone(this.prisma, userId);

    const { next, reviewed, total } = await this.prisma.$transaction(async (tx) => {
      // Trava a sessao: avaliacoes da mesma sessao (clique duplo, nova tentativa) ficam em fila.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "StudySession"
        WHERE id = ${sessionId}::uuid AND "userId" = ${userId}::uuid
        FOR UPDATE
      `;
      if (locked.length === 0) throw sessionNotFound();

      const session = await tx.studySession.findUniqueOrThrow({
        where: { id: sessionId },
        select: { finishedAt: true, cardIds: true },
      });
      if (session.finishedAt) {
        throw new AppException({
          code: ErrorCode.STUDY_SESSION_FINISHED,
          message: 'Essa sessao ja foi encerrada.',
          status: HttpStatus.CONFLICT,
        });
      }
      if (!session.cardIds.includes(dto.cardId)) {
        throw new AppException({
          code: ErrorCode.CARD_NOT_IN_SESSION,
          message: 'Esse card nao faz parte da sessao.',
          status: HttpStatus.BAD_REQUEST,
        });
      }
      const already = await tx.reviewLog.findFirst({
        where: { sessionId, cardId: dto.cardId },
        select: { id: true },
      });
      if (already) {
        throw new AppException({
          code: ErrorCode.CARD_ALREADY_REVIEWED,
          message: 'Esse card ja foi avaliado nesta sessao.',
          status: HttpStatus.CONFLICT,
        });
      }

      // O card pode ter sido excluido, ou o deck removido dos salvos, durante a sessao.
      const card = await tx.card.findFirst({
        where: { id: dto.cardId, deletedAt: null, deck: accessibleDeckWhere(userId) },
        select: { id: true, deckId: true },
      });
      if (!card) throw notFound(ErrorCode.CARD_NOT_FOUND, 'Card nao encontrado.');

      const current = await tx.cardState.findUnique({
        where: { userId_cardId: { userId, cardId: card.id } },
      });
      const stored: StoredCardState | null = current
        ? {
            state: current.state,
            due: current.due,
            stability: current.stability,
            difficulty: current.difficulty,
            elapsedDays: current.elapsedDays,
            scheduledDays: current.scheduledDays,
            learningSteps: current.learningSteps,
            reps: current.reps,
            lapses: current.lapses,
            lastReview: current.lastReview,
          }
        : null;
      const nextState = this.fsrs.review(stored, dto.rating, now);

      await tx.cardState.upsert({
        where: { userId_cardId: { userId, cardId: card.id } },
        create: { userId, cardId: card.id, deckId: card.deckId, ...nextState },
        update: { deckId: card.deckId, ...nextState },
      });
      await tx.reviewLog.create({
        data: {
          userId,
          cardId: card.id,
          deckId: card.deckId,
          sessionId,
          rating: dto.rating,
          durationMs,
          stateBefore: current?.state ?? CardLearningState.NEW,
          scheduledDays: nextState.scheduledDays,
          reviewedAt: now,
        },
      });
      const updated = await tx.studySession.update({
        where: { id: sessionId },
        data: {
          [COUNT_FIELD[dto.rating]]: { increment: 1 },
          totalDurationMs: { increment: durationMs },
        },
        select: { againCount: true, hardCount: true, goodCount: true, cardIds: true },
      });

      return {
        next: nextState,
        reviewed: updated.againCount + updated.hardCount + updated.goodCount,
        total: updated.cardIds.length,
      };
    });

    const status = this.cardStatus.computeStatus(next, tz, now);
    return {
      cardId: dto.cardId,
      rating: dto.rating,
      status: status.status,
      dueInDays: status.dueInDays,
      due: next.due.toISOString(),
      reviewed,
      total,
    };
  }

  // ----------------- POST /study/sessions/:id/finish -----------------

  async finish(userId: string, sessionId: string): Promise<StudySessionSummaryDto> {
    const now = new Date();
    const found = await this.findOwnSession(userId, sessionId);
    if (!found.finishedAt) {
      // Idempotente: so a primeira chamada grava finishedAt.
      await this.prisma.studySession.updateMany({
        where: { id: sessionId, finishedAt: null },
        data: { finishedAt: now },
      });
    }
    const session = await this.findOwnSession(userId, sessionId);
    const tz = await loadUserTimezone(this.prisma, userId);

    const [streak, firstToday, wrongLogs, cards] = await Promise.all([
      this.stats.streakFor(userId, tz, now),
      this.prisma.reviewLog.findFirst({
        where: { userId, reviewedAt: { gte: startOfTodayUtc(tz, now) } },
        orderBy: [{ reviewedAt: 'asc' }, { id: 'asc' }],
        select: { sessionId: true },
      }),
      this.prisma.reviewLog.findMany({
        where: { sessionId, rating: ReviewRating.AGAIN },
        orderBy: { reviewedAt: 'asc' },
        select: { cardId: true },
      }),
      this.prisma.card.findMany({
        where: this.sessionCardsWhere(userId, session.cardIds),
        select: CARD_FOR_SESSION_SELECT,
      }),
    ]);

    const cardById = new Map(cards.map((c) => [c.id, c]));
    const wrongIds = wrongLogs.map((l) => l.cardId);
    const dueRows = await this.prisma.cardState.findMany({
      where: { userId, cardId: { in: wrongIds } },
      select: { cardId: true, due: true },
    });
    const dueByCard = new Map(dueRows.map((r) => [r.cardId, r.due]));

    const counts = {
      again: session.againCount,
      hard: session.hardCount,
      good: session.goodCount,
    };
    const reviewed = counts.again + counts.hard + counts.good;

    return {
      sessionId: session.id,
      startedAt: session.startedAt.toISOString(),
      finishedAt: (session.finishedAt ?? now).toISOString(),
      total: session.cardIds.length,
      reviewed,
      counts,
      accuracyPct: accuracyPct(counts),
      totalDurationMs: session.totalDurationMs,
      avgDurationMs: reviewed > 0 ? Math.round(session.totalDurationMs / reviewed) : null,
      streak: { days: streak.days, increased: firstToday?.sessionId === session.id },
      subjects: this.subjectsOf(session, cards),
      toReview: wrongIds.flatMap((id) => {
        const card = cardById.get(id);
        const due = dueByCard.get(id);
        if (!card || !due) return [];
        return [{ ...this.cardBase(card), due: due.toISOString() }];
      }),
    };
  }

  // ----------------- POST /study/sessions/:id/repeat -----------------

  async repeat(userId: string, sessionId: string): Promise<StudySessionDto> {
    const original = await this.findOwnSession(userId, sessionId);
    const tz = await loadUserTimezone(this.prisma, userId);

    // Os mesmos cards, menos os que nao estao mais disponiveis.
    const still = await this.prisma.card.findMany({
      where: { id: { in: original.cardIds }, deletedAt: null, deck: accessibleDeckWhere(userId) },
      select: { id: true },
    });
    const available = new Set(still.map((c) => c.id));
    let cardIds = original.cardIds.filter((id) => available.has(id));
    if (cardIds.length === 0) throw nothingToStudy();
    if (original.order === StudyOrder.SHUFFLE) cardIds = shuffled(cardIds);

    const session = await this.prisma.studySession.create({
      data: {
        userId,
        deckIds: original.deckIds,
        subjectIds: original.subjectIds,
        cardLimit: original.cardLimit,
        order: original.order,
        cardIds,
      },
    });

    const statuses = await this.cardStatus.cardStatusesFor(userId, cardIds, tz);
    const statusByCard = new Map<string, CardStatus>(
      [...statuses.entries()].map(([id, s]) => [id, s.status]),
    );
    return this.sessionPayload(session, statusByCard);
  }

  // ----------------- GET /study/sessions/:id -----------------

  async getSession(userId: string, sessionId: string): Promise<StudySessionDto> {
    const session = await this.findOwnSession(userId, sessionId);
    const tz = await loadUserTimezone(this.prisma, userId);

    const [statuses, reviews] = await Promise.all([
      this.cardStatus.cardStatusesFor(userId, session.cardIds, tz),
      this.prisma.reviewLog.findMany({
        where: { sessionId: session.id, userId },
        select: { cardId: true },
        distinct: ['cardId'],
      }),
    ]);
    const statusByCard = new Map<string, CardStatus>(
      [...statuses.entries()].map(([id, s]) => [id, s.status]),
    );
    return this.sessionPayload(
      session,
      statusByCard,
      reviews.map((r) => r.cardId),
    );
  }

  // ----------------- helpers -----------------

  private async findOwnSession(userId: string, sessionId: string): Promise<SessionRow> {
    const session = await this.prisma.studySession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw sessionNotFound();
    return session;
  }

  // Cards de uma sessao que o usuario ainda pode ver: se ele removeu o deck dos salvos
  // (ou o dono excluiu o card) depois de comecar, o card some ao retomar e do resumo.
  private sessionCardsWhere(userId: string, cardIds: string[]): Prisma.CardWhereInput {
    return { id: { in: cardIds }, deletedAt: null, deck: accessibleDeckWhere(userId) };
  }

  private async sessionPayload(
    session: SessionRow,
    statusByCard: Map<string, CardStatus>,
    reviewedCardIds: string[] = [],
  ): Promise<StudySessionDto> {
    const cards = await this.prisma.card.findMany({
      where: this.sessionCardsWhere(session.userId, session.cardIds),
      select: CARD_FOR_SESSION_SELECT,
    });
    const byId = new Map(cards.map((c) => [c.id, c]));
    const ordered = session.cardIds.flatMap((id) => {
      const c = byId.get(id);
      return c ? [c] : [];
    });

    const items: StudyCardDto[] = ordered.map((c) => ({
      ...this.cardBase(c),
      status: statusByCard.get(c.id) ?? 'NEW',
    }));

    // A revisao de hoje e a unica sessao sem decks nem materias (o create exige um dos dois).
    const mode =
      session.deckIds.length === 0 && session.subjectIds.length === 0 ? 'today' : 'custom';
    const inSession = new Set(items.map((c) => c.id));

    return {
      sessionId: session.id,
      mode,
      total: items.length,
      order: session.order,
      startedAt: session.startedAt.toISOString(),
      finishedAt: session.finishedAt ? session.finishedAt.toISOString() : null,
      reviewedCardIds: reviewedCardIds.filter((id) => inSession.has(id)),
      subjects: this.subjectsOf(session, ordered),
      cards: items,
    };
  }

  private cardBase(card: {
    id: string;
    deckId: string;
    question: string;
    answer: string;
    deck: { year: number; subjects: Array<{ subject: SubjectRef }> };
  }): Omit<StudyCardDto, 'status'> {
    return {
      id: card.id,
      deckId: card.deckId,
      question: card.question,
      answer: card.answer,
      year: card.deck.year,
      subjects: card.deck.subjects.map((s) => s.subject),
    };
  }

  private subjectsOf(
    session: Pick<SessionRow, 'deckIds' | 'subjectIds'>,
    cards: ReadonlyArray<{ deck: { subjects: Array<{ subject: SubjectRef }> } }>,
  ): SubjectRef[] {
    const onlySubjects = session.deckIds.length === 0 ? session.subjectIds : null;
    return sessionSubjects(
      cards.map((c) => ({ subjects: c.deck.subjects.map((s) => s.subject) })),
      onlySubjects,
    );
  }

  private async msPerCard(userId: string): Promise<number> {
    const recent = await this.prisma.reviewLog.findMany({
      where: { userId },
      orderBy: { reviewedAt: 'desc' },
      take: ESTIMATE_SAMPLE_SIZE,
      select: { durationMs: true },
    });
    return averageMsPerCard(recent.map((r) => r.durationMs));
  }

  private validation(fields: Record<string, string>): AppException {
    return new AppException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Dados invalidos.',
      status: HttpStatus.BAD_REQUEST,
      fields,
    });
  }
}
