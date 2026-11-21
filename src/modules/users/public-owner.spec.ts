import { avatarKeyFor, avatarThumbKey, PUBLIC_OWNER_SELECT, toPublicOwner } from './public-owner';

const publicUrl = (key: string): string => `https://cdn.test/${key}`;
const USER_ID = '0b6f7d2e-3c1a-4f5e-9a8b-1c2d3e4f5a6b';

describe('public-owner', () => {
  it('a miniatura fica ao lado da foto grande, com o sufixo -64', () => {
    expect(avatarKeyFor(USER_ID)).toBe(`avatars/${USER_ID}.webp`);
    expect(avatarThumbKey(avatarKeyFor(USER_ID))).toBe(`avatars/${USER_ID}-64.webp`);
  });

  it('chave fora do padrao nao vira URL (nunca cai na foto grande)', () => {
    expect(avatarThumbKey('avatars/legado.png')).toBeNull();
    expect(toPublicOwner({ firstName: 'Ana', avatarKey: 'avatars/legado.png' }, publicUrl)).toEqual(
      { firstName: 'Ana', avatarUrl: null },
    );
  });

  it('devolve so o primeiro nome e a URL da miniatura', () => {
    const owner = toPublicOwner({ firstName: 'Ana', avatarKey: avatarKeyFor(USER_ID) }, publicUrl);
    expect(owner).toEqual({
      firstName: 'Ana',
      avatarUrl: `https://cdn.test/avatars/${USER_ID}-64.webp`,
    });
    expect(Object.keys(owner).sort()).toEqual(['avatarUrl', 'firstName']);
  });

  it('ignora campos a mais que venham na linha do banco', () => {
    const row = {
      firstName: 'Ana',
      lastName: 'Souza',
      email: 'ana@exemplo.com',
      avatarKey: null,
    };
    expect(toPublicOwner(row, publicUrl)).toEqual({ firstName: 'Ana', avatarUrl: null });
  });

  it('o select do banco so pede o necessario', () => {
    expect(Object.keys(PUBLIC_OWNER_SELECT).sort()).toEqual(['avatarKey', 'firstName']);
  });
});
