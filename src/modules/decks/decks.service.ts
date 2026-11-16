import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeCursor, decodeCursor } from '../../common/pagination/cursor';
import { ImportStatus } from '../../generated/prisma/enums';
import type { Env } from '../../config/env';
import { CardStatusService } from './card-status.service';
import {
  DeckScope,
  type ListDecksQueryDto,
} from './dto/list-decks.query.dto';
import type { CreateDeckDto } from './dto/create-deck.dto';
import type { UpdateDeckDto } from './dto/update-deck.dto';
import type {
  DeckDetailDto,
  DeckListCountsDto,
  DeckListItemDto,
  DeckListResponseDto,
  DeckOwnerDto,
  MyStatsDto,
} from './dto/common.dto';

interface DeckWithRelations {
  id: string;
  name: string;
  year: number;
  cardCount: number;
  saveCount: number;
  visibility: 'PRIVATE' | 'PUBLIC';
  ownerId: string;
  contentUpdatedAt: Date;
  createdAt: Date;
  subjects: Array<{ subject: { id: string; slug: string; name: string } }>;
  owner: { firstName: string; avatarKey: string | null };
}

const DECK_SELECT = {
  id: true,
  name: true,
  year: true,
  cardCount: true,
  saveCount: true,
  visibility: true,
  ownerId: true,
  contentUpdatedAt: true,
  createdAt: true,
  subjects: {
    select: { subject: { select: { id: true, slug: true, name: true } } },
  },
  owner: { select: { firstName: true, avatarKey: true } },
} as const;

@Injectable()
export class DecksService {
  private readonly avatarBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cardStatus: CardStatusService,
    config: ConfigService<Env, true>,
  ) {
    const explicit = config.get('STORAGE_PUBLIC_URL', { infer: true });
    if (explicit) {
      this.avatarBaseUrl = explicit.replace(/\/+$/, '');
    } else {
      const port = config.get('PORT', { infer: true });
      this.avatarBaseUrl = `http://localhost:${port}/uploads`;
    }
  }

  async list(
    userId: string,
    timezone: string,
    query: ListDecksQueryDto,
  ): Promise<DeckListResponseDto> {
    const baseFilters = this.commonFilters(query);
    const scopedWhere = this.buildWhere(userId, query.scope, baseFilters);

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const cursorWhere = cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.k) } },
            { createdAt: new Date(cursor.k), id: { lt: cursor.id } },
          ],
        }
      : {};

    const take = query.limit + 1;
    const decks = await this.prisma.deck.findMany({
      where: { AND: [scopedWhere, cursorWhere] },
      select: DECK_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });

    const hasMore = decks.length > query.limit;
    const page = hasMore ? decks.slice(0, query.limit) : decks;
    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor({
            id: page[page.length - 1]!.id,
            k: page[page.length - 1]!.createdAt.toISOString(),
          })
        : null;

    const counts = await this.computeCounts(userId, baseFilters);

    const deckIds = page.map((d) => d.id);
    const [stats, favs] = await Promise.all([
      this.cardStatus.deckStatsFor(userId, deckIds, timezone),
      this.prisma.deckFavorite.findMany({
        where: { userId, deckId: { in: deckIds } },
        select: { deckId: true },
      }),
    ]);
    const favSet = new Set(favs.map((f) => f.deckId));

    const items = page.map((d) => this.toListItem(d, userId, favSet, stats));

    return { items, nextCursor, counts };
  }

  async recent(userId: string, timezone: string, limit: number): Promise<DeckListItemDto[]> {
    const groups = await this.prisma.reviewLog.groupBy({
      by: ['deckId'],
      where: { userId, deck: { deletedAt: null } },
      _max: { reviewedAt: true },
      orderBy: { _max: { reviewedAt: 'desc' } },
      take: limit,
    });
    const ids = groups.map((g) => g.deckId);
    if (ids.length === 0) return [];

    const decks = await this.prisma.deck.findMany({
      where: { id: { in: ids } },
      select: DECK_SELECT,
    });
    const byId = new Map(decks.map((d) => [d.id, d]));
    const ordered = ids.map((id) => byId.get(id)).filter((d): d is DeckWithRelations => !!d);

    const [stats, favs] = await Promise.all([
      this.cardStatus.deckStatsFor(userId, ids, timezone),
      this.prisma.deckFavorite.findMany({
        where: { userId, deckId: { in: ids } },
        select: { deckId: true },
      }),
    ]);
    const favSet = new Set(favs.map((f) => f.deckId));

    return ordered.map((d) => this.toListItem(d, userId, favSet, stats));
  }

  async create(userId: string, dto: CreateDeckDto): Promise<DeckDetailDto> {
    const importJob = await this.prisma.importJob.findUnique({ where: { id: dto.importId } });
    if (!importJob || importJob.userId !== userId) {
      throw new AppException({
        code: ErrorCode.NOT_FOUND,
        message: 'Importacao nao encontrada.',
        status: HttpStatus.NOT_FOUND,
      });
    }
    if (importJob.status !== ImportStatus.READY) {
      throw new AppException({
        code: ErrorCode.BAD_REQUEST,
        message: 'A importacao ainda nao esta pronta.',
        status: HttpStatus.BAD_REQUEST,
      });
    }

    await this.assertCourseSubjects(userId, dto.subjectIds);
    const pairs = this.pairsFromImport(importJob.pairs);

    const courseId = await this.resolveCourseId(userId);
    const now = new Date();

    const deck = await this.prisma.$transaction(async (tx) => {
      const created = await tx.deck.create({
        data: {
          ownerId: userId,
          courseId,
          year: dto.year,
          name: dto.name,
          visibility: dto.visibility,
          cardCount: pairs.length,
          contentUpdatedAt: now,
          subjects: {
            create: dto.subjectIds.map((subjectId) => ({ subjectId })),
          },
          cards: {
            create: pairs.map((p, index) => ({
              question: p.question,
              answer: p.answer ?? '',
              position: index + 1,
            })),
          },
        },
        select: DECK_SELECT,
      });
      await tx.importJob.update({
        where: { id: dto.importId },
        data: { status: ImportStatus.CONSUMED },
      });
      return created;
    });

    return this.detailFor(userId, 'America/Sao_Paulo', deck);
  }

  async findDetail(userId: string, timezone: string, deckId: string): Promise<DeckDetailDto> {
    const deck = await this.loadVisibleDeck(userId, deckId);
    return this.detailFor(userId, timezone, deck);
  }

  async update(userId: string, deckId: string, dto: UpdateDeckDto): Promise<DeckDetailDto> {
    const deck = await this.loadOwnedDeck(userId, deckId);
    if (dto.subjectIds) {
      await this.assertCourseSubjects(userId, dto.subjectIds);
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.subjectIds) {
        await tx.deckSubject.deleteMany({ where: { deckId } });
        await tx.deckSubject.createMany({
          data: dto.subjectIds.map((subjectId) => ({ deckId, subjectId })),
        });
      }
      const data: Record<string, unknown> = { contentUpdatedAt: now };
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.year !== undefined) data.year = dto.year;
      if (dto.visibility !== undefined) data.visibility = dto.visibility;
      return tx.deck.update({ where: { id: deck.id }, data, select: DECK_SELECT });
    });

    return this.detailFor(userId, 'America/Sao_Paulo', updated);
  }

  async delete(userId: string, deckId: string): Promise<void> {
    const deck = await this.loadOwnedDeck(userId, deckId);
    await this.prisma.deck.update({
      where: { id: deck.id },
      data: { deletedAt: new Date() },
    });
  }

  async appendImport(userId: string, deckId: string, importId: string): Promise<DeckDetailDto> {
    const deck = await this.loadOwnedDeck(userId, deckId);
    const importJob = await this.prisma.importJob.findUnique({ where: { id: importId } });
    if (!importJob || importJob.userId !== userId) {
      throw new AppException({
        code: ErrorCode.NOT_FOUND,
        message: 'Importacao nao encontrada.',
        status: HttpStatus.NOT_FOUND,
      });
    }
    if (importJob.status !== ImportStatus.READY) {
      throw new AppException({
        code: ErrorCode.BAD_REQUEST,
        message: 'A importacao ainda nao esta pronta.',
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const pairs = this.pairsFromImport(importJob.pairs);
    if (pairs.length === 0) {
      throw new AppException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Nenhum par para importar.',
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const last = await tx.card.findFirst({
        where: { deckId: deck.id, deletedAt: null },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const basePos = last?.position ?? 0;

      await tx.card.createMany({
        data: pairs.map((p, index) => ({
          deckId: deck.id,
          question: p.question,
          answer: p.answer ?? '',
          position: basePos + index + 1,
        })),
      });

      await tx.importJob.update({
        where: { id: importId },
        data: { status: ImportStatus.CONSUMED },
      });

      return tx.deck.update({
        where: { id: deck.id },
        data: {
          cardCount: { increment: pairs.length },
          contentUpdatedAt: now,
        },
        select: DECK_SELECT,
      });
    });

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { timezone: true },
    });
    return this.detailFor(userId, user.timezone, updated);
  }

  async addFavorite(userId: string, deckId: string): Promise<void> {
    await this.loadVisibleDeck(userId, deckId);
    await this.prisma.deckFavorite.upsert({
      where: { userId_deckId: { userId, deckId } },
      create: { userId, deckId },
      update: {},
    });
  }

  async removeFavorite(userId: string, deckId: string): Promise<void> {
    await this.prisma.deckFavorite.deleteMany({ where: { userId, deckId } });
  }

  async save(userId: string, deckId: string): Promise<void> {
    const deck = await this.prisma.deck.findFirst({
      where: {
        id: deckId,
        deletedAt: null,
        hiddenAt: null,
        visibility: 'PUBLIC',
        ownerId: { not: userId },
      },
    });
    if (!deck) {
      throw new AppException({
        code: ErrorCode.NOT_FOUND,
        message: 'Deck nao encontrado.',
        status: HttpStatus.NOT_FOUND,
      });
    }
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.deckSave.createMany({
        data: [{ userId, deckId }],
        skipDuplicates: true,
      });
      if (result.count > 0) {
        await tx.deck.update({ where: { id: deckId }, data: { saveCount: { increment: 1 } } });
      }
    });
  }

  async unsave(userId: string, deckId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.deckSave.deleteMany({ where: { userId, deckId } });
      if (deleted.count > 0) {
        await tx.deck.update({ where: { id: deckId }, data: { saveCount: { decrement: 1 } } });
      }
    });
  }

  // ----------------- helpers compartilhados -----------------

  private commonFilters(query: ListDecksQueryDto): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (query.year && query.year.length > 0) where.year = { in: query.year };
    if (query.subjectIds && query.subjectIds.length > 0) {
      where.subjects = { some: { subjectId: { in: query.subjectIds } } };
    }
    if (query.q && query.q.length > 0) {
      where.name = { contains: query.q, mode: 'insensitive' };
    }
    return where;
  }

  private buildWhere(
    userId: string,
    scope: DeckScope,
    baseFilters: Record<string, unknown>,
  ): Record<string, unknown> {
    const base = { deletedAt: null, ...baseFilters };
    switch (scope) {
      case DeckScope.MINE:
        return { ...base, ownerId: userId };
      case DeckScope.COMMUNITY:
        return {
          ...base,
          hiddenAt: null,
          ownerId: { not: userId },
          saves: { some: { userId } },
        };
      case DeckScope.FAVORITES:
        return {
          ...base,
          favorites: { some: { userId } },
          OR: [
            { ownerId: userId },
            { AND: [{ hiddenAt: null }, { saves: { some: { userId } } }] },
          ],
        };
      case DeckScope.ALL:
      default:
        return {
          ...base,
          OR: [
            { ownerId: userId },
            { AND: [{ hiddenAt: null }, { saves: { some: { userId } } }] },
          ],
        };
    }
  }

  private async computeCounts(
    userId: string,
    baseFilters: Record<string, unknown>,
  ): Promise<DeckListCountsDto> {
    const [all, mine, community, favorites] = await Promise.all([
      this.prisma.deck.count({ where: this.buildWhere(userId, DeckScope.ALL, baseFilters) }),
      this.prisma.deck.count({ where: this.buildWhere(userId, DeckScope.MINE, baseFilters) }),
      this.prisma.deck.count({ where: this.buildWhere(userId, DeckScope.COMMUNITY, baseFilters) }),
      this.prisma.deck.count({ where: this.buildWhere(userId, DeckScope.FAVORITES, baseFilters) }),
    ]);
    return { all, mine, community, favorites };
  }

  private async loadVisibleDeck(userId: string, deckId: string): Promise<DeckWithRelations> {
    const deck = await this.prisma.deck.findFirst({
      where: {
        id: deckId,
        deletedAt: null,
        OR: [
          { ownerId: userId },
          { AND: [{ hiddenAt: null }, { saves: { some: { userId } } }] },
        ],
      },
      select: DECK_SELECT,
    });
    if (!deck) {
      throw new AppException({
        code: ErrorCode.NOT_FOUND,
        message: 'Deck nao encontrado.',
        status: HttpStatus.NOT_FOUND,
      });
    }
    return deck;
  }

  private async loadOwnedDeck(userId: string, deckId: string): Promise<DeckWithRelations> {
    const deck = await this.prisma.deck.findFirst({
      where: { id: deckId, ownerId: userId, deletedAt: null },
      select: DECK_SELECT,
    });
    if (!deck) {
      throw new AppException({
        code: ErrorCode.NOT_FOUND,
        message: 'Deck nao encontrado.',
        status: HttpStatus.NOT_FOUND,
      });
    }
    return deck;
  }

  private async assertCourseSubjects(userId: string, subjectIds: string[]): Promise<void> {
    const courseId = await this.resolveCourseId(userId);
    const count = await this.prisma.subject.count({
      where: { id: { in: subjectIds }, courseId },
    });
    if (count !== subjectIds.length) {
      throw new AppException({
        code: ErrorCode.BAD_REQUEST,
        message: 'Materia invalida para o curso.',
        status: HttpStatus.BAD_REQUEST,
      });
    }
  }

  private async resolveCourseId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { courseId: true },
    });
    if (user.courseId) return user.courseId;
    const fallback = await this.prisma.course.findUniqueOrThrow({
      where: { slug: 'medicina' },
      select: { id: true },
    });
    return fallback.id;
  }

  private pairsFromImport(raw: unknown): Array<{ question: string; answer: string | null }> {
    if (!Array.isArray(raw)) return [];
    const out: Array<{ question: string; answer: string | null }> = [];
    for (const item of raw) {
      if (item && typeof item === 'object') {
        const obj = item as { question?: unknown; answer?: unknown };
        if (typeof obj.question === 'string' && obj.question.length > 0) {
          const answer = typeof obj.answer === 'string' ? obj.answer : null;
          out.push({ question: obj.question, answer });
        }
      }
    }
    return out;
  }

  private toListItem(
    deck: DeckWithRelations,
    userId: string,
    favorites: Set<string>,
    stats: Map<string, { dueToday: number; overdue: number; masteryPct: number }>,
  ): DeckListItemDto {
    const isMine = deck.ownerId === userId;
    const st = stats.get(deck.id);
    return {
      id: deck.id,
      name: deck.name,
      year: deck.year,
      cardCount: deck.cardCount,
      subjects: deck.subjects.map((ds) => ds.subject),
      isMine,
      visibility: isMine ? deck.visibility : null,
      owner: isMine ? null : this.ownerSummary(deck.owner),
      isFavorite: favorites.has(deck.id),
      dueToday: st?.dueToday ?? 0,
      overdue: st?.overdue ?? 0,
      masteryPct: st?.masteryPct ?? 0,
      contentUpdatedAt: deck.contentUpdatedAt.toISOString(),
    };
  }

  private async detailFor(
    userId: string,
    timezone: string,
    deck: DeckWithRelations,
  ): Promise<DeckDetailDto> {
    const isMine = deck.ownerId === userId;
    const [statsMap, isFavorite, isSaved, reviewAgg] = await Promise.all([
      this.cardStatus.deckStatsFor(userId, [deck.id], timezone),
      this.prisma.deckFavorite
        .findUnique({ where: { userId_deckId: { userId, deckId: deck.id } } })
        .then((f) => !!f),
      isMine
        ? Promise.resolve(false)
        : this.prisma.deckSave
            .findUnique({ where: { userId_deckId: { userId, deckId: deck.id } } })
            .then((s) => !!s),
      this.prisma.reviewLog.groupBy({
        by: ['rating'],
        where: { userId, deckId: deck.id },
        _count: { _all: true },
      }),
    ]);

    const stats = statsMap.get(deck.id) ?? {
      cardCount: deck.cardCount,
      newCount: deck.cardCount,
      dueToday: 0,
      overdue: 0,
      masteredCount: 0,
      masteryPct: 0,
    };

    const totalReviews = reviewAgg.reduce((acc, r) => acc + r._count._all, 0);
    const correctReviews = reviewAgg
      .filter((r) => r.rating === 'HARD' || r.rating === 'GOOD')
      .reduce((acc, r) => acc + r._count._all, 0);
    const accuracy =
      totalReviews > 0 ? Math.round((correctReviews * 100) / totalReviews) : null;

    const myStats: MyStatsDto = {
      masteryPct: stats.masteryPct,
      dueToday: stats.dueToday,
      overdue: stats.overdue,
      newCount: stats.newCount,
      masteredCount: stats.masteredCount,
      accuracy,
    };

    return {
      id: deck.id,
      name: deck.name,
      year: deck.year,
      cardCount: deck.cardCount,
      subjects: deck.subjects.map((ds) => ds.subject),
      isMine,
      isSaved,
      isFavorite,
      visibility: deck.visibility,
      saveCount: deck.saveCount,
      owner: this.ownerSummary(deck.owner),
      contentUpdatedAt: deck.contentUpdatedAt.toISOString(),
      myStats,
    };
  }

  private ownerSummary(owner: { firstName: string; avatarKey: string | null }): DeckOwnerDto {
    return {
      firstName: owner.firstName,
      avatarUrl: owner.avatarKey ? `${this.avatarBaseUrl}/${owner.avatarKey}` : null,
    };
  }
}
