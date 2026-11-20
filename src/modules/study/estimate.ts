// Tempo de estudo: limite por avaliacao e tempo estimado de uma sessao.

export const MAX_REVIEW_DURATION_MS = 5 * 60 * 1000; // cada card conta no maximo 5 minutos
export const DEFAULT_MS_PER_CARD = 40 * 1000; // sem historico
export const ESTIMATE_SAMPLE_SIZE = 200; // ultimas N avaliacoes

// durationMs vem do cliente: limitado entre 0 e 5 minutos.
export function clampDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs)) return 0;
  return Math.min(Math.max(Math.round(durationMs), 0), MAX_REVIEW_DURATION_MS);
}

// Media de durationMs das ultimas avaliacoes do usuario; 40 s sem historico.
export function averageMsPerCard(recentDurationsMs: readonly number[]): number {
  if (recentDurationsMs.length === 0) return DEFAULT_MS_PER_CARD;
  const total = recentDurationsMs.reduce((acc, ms) => acc + clampDurationMs(ms), 0);
  return total / recentDurationsMs.length;
}

// cards x tempo medio, arredondado para minutos (minimo de 1 quando ha cards).
export function estimatedMinutes(cards: number, msPerCard: number): number {
  if (cards <= 0) return 0;
  return Math.max(1, Math.round((cards * msPerCard) / 60_000));
}
