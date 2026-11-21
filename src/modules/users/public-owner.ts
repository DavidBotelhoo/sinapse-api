// Como outra pessoa aparece no app (Comunidade, Flashcards, Estudar): so o primeiro nome
// e a miniatura do avatar. Nunca sobrenome, email nem a foto grande (docs/produto.md,
// "Privacidade na Comunidade"). Toda resposta que mostra o dono de um deck passa por aqui.

export const AVATAR_LARGE_SIZE = 256;
export const AVATAR_THUMB_SIZE = 64;

const AVATAR_EXT = '.webp';

export function avatarKeyFor(userId: string): string {
  return `avatars/${userId}${AVATAR_EXT}`;
}

// Chave da miniatura gravada junto com a foto grande no upload. Se a chave nao seguir o
// padrao, devolve null: melhor ficar sem foto do que expor a grande.
export function avatarThumbKey(avatarKey: string): string | null {
  if (!avatarKey.endsWith(AVATAR_EXT)) return null;
  return `${avatarKey.slice(0, -AVATAR_EXT.length)}-${AVATAR_THUMB_SIZE}${AVATAR_EXT}`;
}

export const PUBLIC_OWNER_SELECT = { firstName: true, avatarKey: true } as const;

export interface PublicOwnerRow {
  firstName: string;
  avatarKey: string | null;
}

export interface PublicOwner {
  firstName: string;
  avatarUrl: string | null;
}

export function toPublicOwner(
  owner: PublicOwnerRow,
  publicUrl: (key: string) => string,
): PublicOwner {
  const thumb = owner.avatarKey ? avatarThumbKey(owner.avatarKey) : null;
  return {
    firstName: owner.firstName,
    avatarUrl: thumb ? publicUrl(thumb) : null,
  };
}
