import { encodeCursor } from '../../common/pagination/cursor';
import { decodeCardCursor, padPosition } from './cards.service';

describe('cursor da lista de cards', () => {
  const id = '0c4d4c55-7d7c-4a5e-9f1e-3f0a2b1c9d8e';

  it('ida e volta pela posicao', () => {
    for (const position of [1, 35, 36, 1000, 2_000_000]) {
      expect(decodeCardCursor(encodeCursor({ id, k: padPosition(position) }))).toEqual({
        id,
        position,
      });
    }
  });

  it('recusa cursor adulterado', () => {
    expect(decodeCardCursor(encodeCursor({ id: 'nao-uuid', k: '00000001' }))).toBeNull();
    expect(decodeCardCursor(encodeCursor({ id, k: '-1' }))).toBeNull();
    expect(decodeCardCursor(encodeCursor({ id, k: 'zzzzzzzzz' }))).toBeNull();
    expect(decodeCardCursor('%%%')).toBeNull();
  });
});
