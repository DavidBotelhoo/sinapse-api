import type { Prisma } from '../../generated/prisma/client';

// "Decks que o usuario tem": os proprios e os salvos da Comunidade, sem os excluidos.
// Um deck ocultado pela moderacao (hiddenAt) sai da Comunidade e da previa, mas quem ja
// salvou continua com ele (docs/dominio.md, "Moderacao").
// Fonte unica para Flashcards, Estudo, Estatisticas e Agenda.
export function accessibleDeckWhere(userId: string): Prisma.DeckWhereInput {
  return {
    deletedAt: null,
    OR: [{ ownerId: userId }, { saves: { some: { userId } } }],
  };
}
