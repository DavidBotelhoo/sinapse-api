import { encodeCursor } from '../../common/pagination/cursor';
import {
  afterCursorWhere,
  communityOrderBy,
  decodeCommunityCursor,
  encodeCommunityCursor,
} from './community-cursor';
import { CommunitySort } from './dto/community.dto';

const ID = '7f1f2c6c-5a2a-4e2e-8f1e-9c7f9e0a1b2c';
const DECK = { id: ID, saveCount: 1248, contentUpdatedAt: new Date('2026-11-18T13:45:10.123Z') };

describe('community-cursor', () => {
  it('popular: ida e volta pelo saveCount', () => {
    const raw = encodeCommunityCursor(CommunitySort.POPULAR, DECK);
    expect(decodeCommunityCursor(raw, CommunitySort.POPULAR)).toEqual({
      sort: CommunitySort.POPULAR,
      id: ID,
      saveCount: 1248,
    });
  });

  it('recentes: ida e volta pela data, com milissegundos', () => {
    const raw = encodeCommunityCursor(CommunitySort.RECENT, DECK);
    expect(decodeCommunityCursor(raw, CommunitySort.RECENT)).toEqual({
      sort: CommunitySort.RECENT,
      id: ID,
      contentUpdatedAt: DECK.contentUpdatedAt,
    });
  });

  it('cursor de uma ordem nao vale na outra', () => {
    const popular = encodeCommunityCursor(CommunitySort.POPULAR, DECK);
    const recent = encodeCommunityCursor(CommunitySort.RECENT, DECK);
    expect(decodeCommunityCursor(popular, CommunitySort.RECENT)).toBeNull();
    expect(decodeCommunityCursor(recent, CommunitySort.POPULAR)).toBeNull();
  });

  it.each([
    ['lixo', 'nao-e-base64-json'],
    ['id que nao e uuid', encodeCursor({ id: "1' OR 1=1", k: 'p:3' })],
    ['saveCount negativo', encodeCursor({ id: ID, k: 'p:-1' })],
    ['saveCount fora do int4', encodeCursor({ id: ID, k: 'p:9999999999' })],
    ['saveCount decimal', encodeCursor({ id: ID, k: 'p:1.5' })],
  ])('popular recusa %s', (_label, raw) => {
    expect(decodeCommunityCursor(raw, CommunitySort.POPULAR)).toBeNull();
  });

  it.each([
    ['data invalida', encodeCursor({ id: ID, k: 'r:ontem' })],
    ['data fora do ISO', encodeCursor({ id: ID, k: 'r:2026-11-18' })],
  ])('recentes recusa %s', (_label, raw) => {
    expect(decodeCommunityCursor(raw, CommunitySort.RECENT)).toBeNull();
  });

  it('ordena pela chave da ordem e desempata pelo id, sempre decrescente', () => {
    expect(communityOrderBy(CommunitySort.POPULAR)).toEqual([
      { saveCount: 'desc' },
      { id: 'desc' },
    ]);
    expect(communityOrderBy(CommunitySort.RECENT)).toEqual([
      { contentUpdatedAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('a proxima pagina comeca depois do ultimo item (chave menor, ou mesma chave e id menor)', () => {
    expect(afterCursorWhere({ sort: CommunitySort.POPULAR, id: ID, saveCount: 10 })).toEqual({
      OR: [{ saveCount: { lt: 10 } }, { saveCount: 10, id: { lt: ID } }],
    });

    const at = DECK.contentUpdatedAt;
    expect(afterCursorWhere({ sort: CommunitySort.RECENT, id: ID, contentUpdatedAt: at })).toEqual({
      OR: [{ contentUpdatedAt: { lt: at } }, { contentUpdatedAt: at, id: { lt: ID } }],
    });
  });
});
