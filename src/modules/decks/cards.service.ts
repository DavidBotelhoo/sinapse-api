import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeCursor, decodeCursor } from '../../common/pagination/cursor';
import { CardStatusService } from './card-status.service';
import { accessibleDeckWhere } from './deck-access';
import { CardsFilter, type ListCardsQueryDto } from './dto/cards.dto';
import type { CardItemDto, CardListResponseDto, CreateCardDto, UpdateCardDto } from './dto/cards.dto';

function padPosition(pos: number): string {
  return pos.toString(36).padStart(8, '0');
}

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cardStatus: CardStatusService,
  ) {}

  async list(
    userId: string,
    timezone: string,
    deckId: string,
    query: ListCardsQueryDto,
  ): Promise<CardListResponseDto> {
    await this.assertVisibleDeck(userId, deckId);

    const base: Record<string, unknown> = { deckId, deletedAt: null };
    if (query.q && query.q.length > 0) {
      base.OR = [
        { question: { contains: query.q, mode: 'insensitive' } },
        { answer: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const cardIdsByStatus = await this.filterIdsByStatus(
      userId,
      deckId,
      timezone,
      query.status,
    );
    if (query.status !== CardsFilter.ALL) {
      base.id = { in: cardIdsByStatus };
    }

    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const cursorWhere = cursor
      ? {
          OR: [
            { position: { gt: this.decodePosition(cursor.k) } },
            { position: this.decodePosition(cursor.k), id: { gt: cursor.id } },
          ],
        }
      : {};

    const take = query.limit + 1;
    const cards = await this.prisma.card.findMany({
      where: { AND: [base, cursorWhere] },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      take,
      select: { id: true, position: true, question: true, answer: true },
    });

    const hasMore = cards.length > query.limit;
    const page = hasMore ? cards.slice(0, query.limit) : cards;

    const statusMap = await this.cardStatus.cardStatusesFor(
      userId,
      page.map((c) => c.id),
      timezone,
    );

    const items: CardItemDto[] = page.map((c) => {
      const s = statusMap.get(c.id) ?? { status: 'NEW' as const, dueInDays: null };
      return {
        id: c.id,
        position: c.position,
        question: c.question,
        answer: c.answer,
        status: s.status,
        dueInDays: s.dueInDays,
      };
    });

    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor({
            id: page[page.length - 1]!.id,
            k: padPosition(page[page.length - 1]!.position),
          })
        : null;

    const counts = await this.cardStatus.deckCardCounts(userId, deckId, timezone);

    return { items, nextCursor, counts };
  }

  async create(userId: string, deckId: string, dto: CreateCardDto): Promise<CardItemDto> {
    await this.assertOwnedDeck(userId, deckId);
    const now = new Date();

    const card = await this.prisma.$transaction(async (tx) => {
      const last = await tx.card.findFirst({
        where: { deckId, deletedAt: null },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const nextPosition = (last?.position ?? 0) + 1;
      const created = await tx.card.create({
        data: {
          deckId,
          question: dto.question,
          answer: dto.answer,
          position: nextPosition,
        },
        select: { id: true, position: true, question: true, answer: true },
      });
      await tx.deck.update({
        where: { id: deckId },
        data: { cardCount: { increment: 1 }, contentUpdatedAt: now },
      });
      return created;
    });

    return {
      id: card.id,
      position: card.position,
      question: card.question,
      answer: card.answer,
      status: 'NEW',
      dueInDays: null,
    };
  }

  async update(userId: string, cardId: string, dto: UpdateCardDto): Promise<CardItemDto> {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, deletedAt: null },
      include: { deck: { select: { ownerId: true, deletedAt: true } } },
    });
    if (!card || card.deck.deletedAt || card.deck.ownerId !== userId) {
      throw new AppException({
        code: ErrorCode.NOT_FOUND,
        message: 'Card nao encontrado.',
        status: HttpStatus.NOT_FOUND,
      });
    }

    const now = new Date();
    const data: Record<string, unknown> = {};
    if (dto.question !== undefined) data.question = dto.question;
    if (dto.answer !== undefined) data.answer = dto.answer;

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.card.update({
        where: { id: cardId },
        data,
        select: { id: true, position: true, question: true, answer: true, deckId: true },
      });
      await tx.deck.update({
        where: { id: u.deckId },
        data: { contentUpdatedAt: now },
      });
      return u;
    });

    return {
      id: updated.id,
      position: updated.position,
      question: updated.question,
      answer: updated.answer,
      status: 'NEW',
      dueInDays: null,
    };
  }

  async delete(userId: string, cardId: string): Promise<void> {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, deletedAt: null },
      include: { deck: { select: { ownerId: true, deletedAt: true } } },
    });
    if (!card || card.deck.deletedAt || card.deck.ownerId !== userId) {
      throw new AppException({
        code: ErrorCode.NOT_FOUND,
        message: 'Card nao encontrado.',
        status: HttpStatus.NOT_FOUND,
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.card.update({ where: { id: cardId }, data: { deletedAt: now } });
      await tx.deck.update({
        where: { id: card.deckId },
        data: { cardCount: { decrement: 1 }, contentUpdatedAt: now },
      });
    });
  }

  // ---------- helpers ----------

  private decodePosition(k: string): number {
    const n = parseInt(k, 36);
    return Number.isFinite(n) ? n : 0;
  }

  private async assertVisibleDeck(userId: string, deckId: string): Promise<void> {
    const deck = await this.prisma.deck.findFirst({
      where: { id: deckId, ...accessibleDeckWhere(userId) },
      select: { id: true },
    });
    if (!deck) {
      throw new AppException({
        code: ErrorCode.NOT_FOUND,
        message: 'Deck nao encontrado.',
        status: HttpStatus.NOT_FOUND,
      });
    }
  }

  private async assertOwnedDeck(userId: string, deckId: string): Promise<void> {
    const deck = await this.prisma.deck.findFirst({
      where: { id: deckId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!deck) {
      throw new AppException({
        code: ErrorCode.NOT_FOUND,
        message: 'Deck nao encontrado.',
        status: HttpStatus.NOT_FOUND,
      });
    }
  }

  private async filterIdsByStatus(
    userId: string,
    deckId: string,
    timezone: string,
    status: CardsFilter,
  ): Promise<string[]> {
    if (status === CardsFilter.ALL) return [];

    const cards = await this.prisma.card.findMany({
      where: { deckId, deletedAt: null },
      select: { id: true },
    });
    const statusMap = await this.cardStatus.cardStatusesFor(
      userId,
      cards.map((c) => c.id),
      timezone,
    );
    const match = (s: string): boolean => {
      switch (status) {
        case CardsFilter.NEW:
          return s === 'NEW';
        case CardsFilter.MASTERED:
          return s === 'MASTERED';
        case CardsFilter.DUE:
          return s === 'DUE_TODAY' || s === 'OVERDUE';
      }
    };
    const out: string[] = [];
    for (const [id, result] of statusMap) {
      if (match(result.status)) out.push(id);
    }
    return out;
  }
}
