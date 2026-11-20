import type { Prisma } from '../../generated/prisma/client';

// "Decks que o usuario tem": os proprios e os salvos da Comunidade, sem os excluidos.
// Salvos que foram ocultados pela moderacao ficam de fora (mesma regra da aba Flashcards).
// Fonte unica para Flashcards, Estudo, Estatisticas e Agenda.
export function accessibleDeckWhere(userId: string): Prisma.DeckWhereInput {
  return {
    deletedAt: null,
    OR: [{ ownerId: userId }, { AND: [{ hiddenAt: null }, { saves: { some: { userId } } }] }],
  };
}
