import { CardLearningState } from '../../generated/prisma/enums';
import { CardStatusService } from './card-status.service';

describe('CardStatusService.computeStatus', () => {
  const svc = new CardStatusService({} as never);
  const tz = 'America/Sao_Paulo';
  // "agora" = 2026-11-16T12:00:00Z (09:00 local SP).
  // startOfToday SP -> 2026-11-16T03:00:00Z
  // startOfTomorrow SP -> 2026-11-17T03:00:00Z
  const now = new Date('2026-11-16T12:00:00Z');

  it('CardState nulo = NEW', () => {
    expect(svc.computeStatus(null, tz, now)).toEqual({ status: 'NEW', dueInDays: null });
  });

  it('state = NEW = NEW', () => {
    expect(
      svc.computeStatus(
        { state: CardLearningState.NEW, due: now, scheduledDays: 0 },
        tz,
        now,
      ),
    ).toEqual({ status: 'NEW', dueInDays: null });
  });

  it('due antes do inicio de hoje = OVERDUE', () => {
    expect(
      svc.computeStatus(
        {
          state: CardLearningState.REVIEW,
          due: new Date('2026-11-15T20:00:00Z'),
          scheduledDays: 3,
        },
        tz,
        now,
      ),
    ).toEqual({ status: 'OVERDUE', dueInDays: null });
  });

  it('due no dia local = DUE_TODAY', () => {
    expect(
      svc.computeStatus(
        {
          state: CardLearningState.REVIEW,
          due: new Date('2026-11-16T20:00:00Z'),
          scheduledDays: 5,
        },
        tz,
        now,
      ),
    ).toEqual({ status: 'DUE_TODAY', dueInDays: null });
  });

  it('scheduledDays >= 21 em REVIEW = MASTERED mesmo com due no futuro', () => {
    expect(
      svc.computeStatus(
        {
          state: CardLearningState.REVIEW,
          due: new Date('2026-12-16T00:00:00Z'),
          scheduledDays: 30,
        },
        tz,
        now,
      ),
    ).toEqual({ status: 'MASTERED', dueInDays: null });
  });

  it('due no futuro com scheduledDays < 21 = SCHEDULED com dueInDays', () => {
    const result = svc.computeStatus(
      {
        state: CardLearningState.REVIEW,
        due: new Date('2026-11-20T12:00:00Z'),
        scheduledDays: 4,
      },
      tz,
      now,
    );
    expect(result.status).toBe('SCHEDULED');
    expect(result.dueInDays).toBe(4);
  });

  it('LEARNING nao tira o card do fluxo de SCHEDULED/DUE', () => {
    expect(
      svc.computeStatus(
        {
          state: CardLearningState.LEARNING,
          due: new Date('2026-11-15T20:00:00Z'),
          scheduledDays: 1,
        },
        tz,
        now,
      ),
    ).toEqual({ status: 'OVERDUE', dueInDays: null });
  });

  it('dominado que venceu hoje volta para a revisao (DUE_TODAY, nao MASTERED)', () => {
    expect(
      svc.computeStatus(
        {
          state: CardLearningState.REVIEW,
          due: new Date('2026-11-16T20:00:00Z'), // 17:00 local de hoje
          scheduledDays: 30,
        },
        tz,
        now,
      ),
    ).toEqual({ status: 'DUE_TODAY', dueInDays: null });
  });

  it('dominado vencido antes de hoje = OVERDUE', () => {
    expect(
      svc.computeStatus(
        {
          state: CardLearningState.REVIEW,
          due: new Date('2026-11-10T12:00:00Z'),
          scheduledDays: 45,
        },
        tz,
        now,
      ),
    ).toEqual({ status: 'OVERDUE', dueInDays: null });
  });
});

describe('CardStatusService.deckStatsFor', () => {
  const tz = 'America/Sao_Paulo';
  const now = new Date('2026-11-16T12:00:00Z');
  const deckId = 'deck-1';

  function serviceWith(
    cardCount: number,
    states: Array<{ state: CardLearningState; due: Date; scheduledDays: number }>,
  ): { svc: CardStatusService; findMany: jest.Mock } {
    const findMany = jest.fn().mockResolvedValue(states.map((s) => ({ deckId, ...s })));
    const prisma = {
      deck: { findMany: jest.fn().mockResolvedValue([{ id: deckId, cardCount }]) },
      cardState: { findMany },
    };
    return { svc: new CardStatusService(prisma as never), findMany };
  }

  it('conta dominado vencido como pendente, nao como dominado', async () => {
    const { svc } = serviceWith(4, [
      { state: CardLearningState.REVIEW, due: new Date('2026-11-16T20:00:00Z'), scheduledDays: 30 },
      { state: CardLearningState.REVIEW, due: new Date('2026-11-10T12:00:00Z'), scheduledDays: 40 },
      { state: CardLearningState.REVIEW, due: new Date('2026-12-20T12:00:00Z'), scheduledDays: 34 },
    ]);
    const stats = (await svc.deckStatsFor('u1', [deckId], tz, now)).get(deckId)!;
    expect(stats).toMatchObject({
      cardCount: 4,
      newCount: 1,
      dueToday: 1,
      overdue: 1,
      masteredCount: 1,
      masteryPct: 25,
    });
  });

  it('ignora estados de cards excluidos', async () => {
    const { svc, findMany } = serviceWith(1, []);
    await svc.deckStatsFor('u1', [deckId], tz, now);
    expect(findMany.mock.calls[0][0].where).toMatchObject({ card: { deletedAt: null } });
  });
});
