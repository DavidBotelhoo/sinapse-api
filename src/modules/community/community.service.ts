import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import type { Prisma } from '../../generated/prisma/client';
import { DeckVisibility } from '../../generated/prisma/enums';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveUserCourseId } from '../catalog/user-course';
import { StorageService } from '../storage/storage.service';
import { PUBLIC_OWNER_SELECT, toPublicOwner, type PublicOwnerRow } from '../users/public-owner';
import {
  afterCursorWhere,
  communityOrderBy,
  decodeCommunityCursor,
  encodeCommunityCursor,
} from './community-cursor';
import { matchSubjectIds } from './community-search';
import {
  PREVIEW_CARD_COUNT,
  type CommunityDeckDetailDto,
  type CommunityDeckDto,
  type CommunityDeckListDto,
  type CommunityDecksQueryDto,
  type CommunityPreviewCardDto,
} from './dto/community.dto';

// O que pode sair numa resposta da Comunidade. O dono vem so com PUBLIC_OWNER_SELECT
// (primeiro nome e chave do avatar); nada de sobrenome, email ou outras colunas.
const COMMUNITY_DECK_SELECT = {
  id: true,
  name: true,
  year: true,
  cardCount: true,
  saveCount: true,
  ownerId: true,
  contentUpdatedAt: true,
  subjects: { select: { subject: { select: { id: true, slug: true, name: true } } } },
  owner: { select: PUBLIC_OWNER_SELECT },
} as const;

interface CommunityDeckRow {
  id: string;
  name: string;
  year: number;
  cardCount: number;
  saveCount: number;
  ownerId: string;
  contentUpdatedAt: Date;
  subjects: Array<{ subject: { id: string; slug: string; name: string } }>;
  owner: PublicOwnerRow;
}

// Deck na Comunidade: publico, nao excluido, nao ocultado pela moderacao e do curso do
// usuario. Os decks publicos do proprio usuario tambem aparecem (com isMine).
export function communityDeckWhere(courseId: string): Prisma.DeckWhereInput {
  return {
    courseId,
    visibility: DeckVisibility.PUBLIC,
    deletedAt: null,
    hiddenAt: null,
  };
}

@Injectable()
export class CommunityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(userId: string, query: CommunityDecksQueryDto): Promise<CommunityDeckListDto> {
    const cursor = query.cursor ? decodeCommunityCursor(query.cursor, query.sort) : null;
    if (query.cursor && !cursor) {
      throw new AppException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Dados inválidos.',
        status: HttpStatus.BAD_REQUEST,
        fields: { cursor: 'Cursor inválido para esta ordem. Recarregue a lista.' },
      });
    }

    const courseId = await resolveUserCourseId(this.prisma, userId);
    const filtered = await this.filteredWhere(courseId, query);

    const [rows, total] = await Promise.all([
      this.prisma.deck.findMany({
        where: cursor ? { AND: [filtered, afterCursorWhere(cursor)] } : filtered,
        orderBy: communityOrderBy(query.sort),
        take: query.limit + 1,
        select: COMMUNITY_DECK_SELECT,
      }),
      this.prisma.deck.count({ where: filtered }),
    ]);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    const saved = await this.savedSet(
      userId,
      page.map((d) => d.id),
    );

    return {
      items: page.map((d) => this.toItem(d, userId, saved.has(d.id))),
      nextCursor: hasMore && last ? encodeCommunityCursor(query.sort, last) : null,
      total,
    };
  }

  async preview(userId: string, deckId: string): Promise<CommunityDeckDetailDto> {
    const courseId = await resolveUserCourseId(this.prisma, userId);
    const deck = await this.prisma.deck.findFirst({
      where: { id: deckId, ...communityDeckWhere(courseId) },
      select: COMMUNITY_DECK_SELECT,
    });
    if (!deck) {
      throw new AppException({
        code: ErrorCode.DECK_NOT_FOUND,
        message: 'Deck não encontrado.',
        status: HttpStatus.NOT_FOUND,
      });
    }

    // So os primeiros cards, para todo mundo (inclusive quem salvou ou o dono): a lista
    // completa fica em /decks/:id/cards, que exige ter o deck.
    const [previewCards, saved] = await Promise.all([
      this.prisma.card.findMany({
        where: { deckId: deck.id, deletedAt: null },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        take: PREVIEW_CARD_COUNT,
        select: { id: true, position: true, question: true, answer: true },
      }),
      this.savedSet(userId, [deck.id]),
    ]);

    return {
      ...this.toItem(deck, userId, saved.has(deck.id)),
      contentUpdatedAt: deck.contentUpdatedAt.toISOString(),
      previewCards: previewCards satisfies CommunityPreviewCardDto[],
    };
  }

  // ----------------- helpers -----------------

  private async filteredWhere(
    courseId: string,
    query: CommunityDecksQueryDto,
  ): Promise<Prisma.DeckWhereInput> {
    const and: Prisma.DeckWhereInput[] = [communityDeckWhere(courseId)];

    if (query.year && query.year.length > 0) {
      and.push({ year: { in: query.year } });
    }
    if (query.subjectIds && query.subjectIds.length > 0) {
      and.push({ subjects: { some: { subjectId: { in: query.subjectIds } } } });
    }
    if (query.q && query.q.length > 0) {
      const subjects = await this.prisma.subject.findMany({
        where: { courseId },
        select: { id: true, name: true },
      });
      const subjectIds = matchSubjectIds(subjects, query.q);
      const text: Prisma.DeckWhereInput[] = [{ name: { contains: query.q, mode: 'insensitive' } }];
      if (subjectIds.length > 0) {
        text.push({ subjects: { some: { subjectId: { in: subjectIds } } } });
      }
      and.push({ OR: text });
    }

    return { AND: and };
  }

  private async savedSet(userId: string, deckIds: string[]): Promise<Set<string>> {
    if (deckIds.length === 0) return new Set();
    const saves = await this.prisma.deckSave.findMany({
      where: { userId, deckId: { in: deckIds } },
      select: { deckId: true },
    });
    return new Set(saves.map((s) => s.deckId));
  }

  private toItem(deck: CommunityDeckRow, userId: string, isSaved: boolean): CommunityDeckDto {
    return {
      id: deck.id,
      name: deck.name,
      year: deck.year,
      subjects: deck.subjects.map((s) => s.subject),
      cardCount: deck.cardCount,
      saveCount: deck.saveCount,
      isSaved,
      isMine: deck.ownerId === userId,
      owner: toPublicOwner(deck.owner, (key) => this.storage.publicUrl(key)),
    };
  }
}
