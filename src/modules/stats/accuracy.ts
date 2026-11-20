// Taxa de acerto = (Dificil + Facil) / total de avaliacoes, em % inteiro. Null sem avaliacoes.
export interface RatingCounts {
  again: number;
  hard: number;
  good: number;
}

export function accuracyPct(counts: RatingCounts): number | null {
  const total = counts.again + counts.hard + counts.good;
  if (total === 0) return null;
  return Math.round(((counts.hard + counts.good) * 100) / total);
}
