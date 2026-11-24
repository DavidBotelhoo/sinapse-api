import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { localDateKey, localDayBoundaries } from '../../common/time/user-day';
import { loadUserTimezone } from '../../common/time/user-timezone';
import { CardLearningState } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { accessibleDeckWhere } from '../decks/deck-access';
import { countDuePerDay, countDuePerDeck } from './agenda';
import type { AgendaDto, AgendaQueryDto, MeStatsDto } from './dto/stats.dto';
import { computeStreak, type StreakResult } from './streak';
import { computeWeekStats, weekStatsWindowStart } from './week-stats';

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(userId: string): Promise<MeStatsDto> {
    const now = new Date();
    const tz = await loadUserTimezone(this.prisma, userId);

    const [streak, reviews] = await Promise.all([
      this.streakFor(userId, tz, now),
      this.prisma.reviewLog.findMany({
        where: { userId, reviewedAt: { gte: weekStatsWindowStart(tz, now) } },
        select: { reviewedAt: true, durationMs: true, rating: true },
      }),
    ]);
    const week = computeWeekStats(reviews, tz, now);

    return { streak: streak.days, studiedToday: streak.studiedToday, ...week };
  }

  // Dias locais distintos com avaliacao: a conversao de fuso fica no Postgres para nao trazer
  // cada avaliacao para a memoria. "reviewedAt" e timestamp sem fuso, gravado em UTC.
  async streakFor(userId: string, timezone: string, now: Date): Promise<StreakResult> {
    const rows = await this.prisma.$queryRaw<Array<{ day: string }>>`
      SELECT DISTINCT to_char(("reviewedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS day
      FROM "ReviewLog"
      WHERE "userId" = ${userId}::uuid
    `;
    return computeStreak(
      rows.map((r) => r.day),
      localDateKey(now, timezone),
    );
  }

  async getAgenda(userId: string, query: AgendaQueryDto): Promise<AgendaDto> {
    const now = new Date();
    const tz = await loadUserTimezone(this.prisma, userId);
    const days = query.days;

    const boundaries = localDayBoundaries(now, days, tz);
    const keys = boundaries.slice(0, -1).map((b) => localDateKey(b, tz));
    const date = query.date ?? keys[0]!;
    const dayIdx = keys.indexOf(date);
    if (dayIdx < 0) {
      throw new AppException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Dados inválidos.',
        status: HttpStatus.BAD_REQUEST,
        fields: { date: 'Escolha um dia dentro da agenda.' },
      });
    }

    // Tudo que vence ate o fim da janela (inclusive os atrasados), nos decks que o usuario tem.
    const dues = await this.prisma.cardState.findMany({
      where: {
        userId,
        state: { not: CardLearningState.NEW },
        due: { lt: boundaries[days]! },
        card: { deletedAt: null },
        deck: accessibleDeckWhere(userId),
      },
      select: { deckId: true, due: true },
    });

    const perDay = countDuePerDay(dues, boundaries);
    const perDeck = countDuePerDeck(
      dues,
      boundaries[dayIdx]!,
      boundaries[dayIdx + 1]!,
      dayIdx === 0,
    );

    const deckRows = await this.prisma.deck.findMany({
      where: { id: { in: perDeck.map((d) => d.deckId) } },
      select: {
        id: true,
        name: true,
        year: true,
        subjects: { select: { subject: { select: { id: true, slug: true, name: true } } } },
      },
    });
    const deckById = new Map(deckRows.map((d) => [d.id, d]));

    const dayItems = keys.map((key, i) => ({
      date: key,
      total: perDay[i]!.total,
      overdue: perDay[i]!.overdue,
    }));

    return {
      days: dayItems,
      total: dayItems.reduce((acc, d) => acc + d.total, 0),
      date,
      decks: perDeck.flatMap((entry) => {
        const deck = deckById.get(entry.deckId);
        if (!deck) return [];
        return [
          {
            id: deck.id,
            name: deck.name,
            year: deck.year,
            subjects: deck.subjects.map((s) => s.subject),
            due: entry.dueOnDay,
            overdue: entry.overdue,
            total: entry.total,
            overdueSince: entry.oldestOverdue ? localDateKey(entry.oldestOverdue, tz) : null,
          },
        ];
      }),
    };
  }
}
