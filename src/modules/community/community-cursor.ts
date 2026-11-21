import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import type { Prisma } from '../../generated/prisma/client';
import { CommunitySort } from './dto/community.dto';

// Cursor da Comunidade. A chave leva a ordem ("p:" popular, "r:" recentes), entao um
// cursor de uma ordem nao serve para a outra.

export interface CursorDeck {
  id: string;
  saveCount: number;
  contentUpdatedAt: Date;
}

export type CommunityCursor =
  | { sort: CommunitySort.POPULAR; id: string; saveCount: number }
  | { sort: CommunitySort.RECENT; id: string; contentUpdatedAt: Date };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INT4_MAX = 2_147_483_647;

export function encodeCommunityCursor(sort: CommunitySort, deck: CursorDeck): string {
  const k =
    sort === CommunitySort.POPULAR
      ? `p:${deck.saveCount}`
      : `r:${deck.contentUpdatedAt.toISOString()}`;
  return encodeCursor({ id: deck.id, k });
}

export function decodeCommunityCursor(raw: string, sort: CommunitySort): CommunityCursor | null {
  const cursor = decodeCursor(raw);
  if (!cursor || !UUID_RE.test(cursor.id)) return null;

  if (sort === CommunitySort.POPULAR) {
    const match = /^p:(\d{1,10})$/.exec(cursor.k);
    if (!match) return null;
    const saveCount = Number(match[1]);
    if (saveCount > INT4_MAX) return null;
    return { sort, id: cursor.id, saveCount };
  }

  const match = /^r:(.+)$/.exec(cursor.k);
  if (!match) return null;
  const iso = match[1]!;
  const contentUpdatedAt = new Date(iso);
  if (Number.isNaN(contentUpdatedAt.getTime()) || contentUpdatedAt.toISOString() !== iso) {
    return null;
  }
  return { sort, id: cursor.id, contentUpdatedAt };
}

export function communityOrderBy(sort: CommunitySort): Prisma.DeckOrderByWithRelationInput[] {
  return sort === CommunitySort.POPULAR
    ? [{ saveCount: 'desc' }, { id: 'desc' }]
    : [{ contentUpdatedAt: 'desc' }, { id: 'desc' }];
}

// Itens depois do cursor na ordem decrescente (chave, id).
export function afterCursorWhere(cursor: CommunityCursor): Prisma.DeckWhereInput {
  if (cursor.sort === CommunitySort.POPULAR) {
    return {
      OR: [
        { saveCount: { lt: cursor.saveCount } },
        { saveCount: cursor.saveCount, id: { lt: cursor.id } },
      ],
    };
  }
  return {
    OR: [
      { contentUpdatedAt: { lt: cursor.contentUpdatedAt } },
      { contentUpdatedAt: cursor.contentUpdatedAt, id: { lt: cursor.id } },
    ],
  };
}
