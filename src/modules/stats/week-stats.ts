import { ReviewRating } from '../../generated/prisma/enums';
import {
  addLocalDays,
  dayIndexOf,
  localDateKey,
  localDayBoundaries,
  startOfTodayUtc,
  startOfWeekUtc,
} from '../../common/time/user-day';
import { accuracyPct, type RatingCounts } from './accuracy';

export interface ReviewPoint {
  reviewedAt: Date;
  durationMs: number;
  rating: ReviewRating;
}

export interface WeekStats {
  weekStart: string; // segunda-feira local, "YYYY-MM-DD"
  weekStudied: boolean[]; // seg..dom
  cardsThisWeek: number;
  cardsDeltaPct: number | null;
  minutesThisWeek: number;
  minutesPerDay: number[]; // seg..dom
  accuracy7d: number | null;
}

// Inicio da janela que computeWeekStats precisa (segunda-feira da semana anterior).
export function weekStatsWindowStart(timezone: string, now: Date): Date {
  return addLocalDays(startOfWeekUtc(timezone, now), -7, timezone);
}

function emptyCounts(): RatingCounts {
  return { again: 0, hard: 0, good: 0 };
}

function addRating(counts: RatingCounts, rating: ReviewRating): void {
  if (rating === ReviewRating.AGAIN) counts.again += 1;
  else if (rating === ReviewRating.HARD) counts.hard += 1;
  else counts.good += 1;
}

// Calcula os cards da tela Inicio a partir das avaliacoes desde a segunda-feira da semana anterior.
export function computeWeekStats(
  reviews: readonly ReviewPoint[],
  timezone: string,
  now: Date,
): WeekStats {
  const weekStart = startOfWeekUtc(timezone, now);
  const days = localDayBoundaries(weekStart, 7, timezone);
  const lastWeekStart = addLocalDays(weekStart, -7, timezone);
  // "Mesmo periodo da semana anterior": da segunda anterior ate o mesmo ponto da semana.
  const lastWeekCutoff = lastWeekStart.getTime() + (now.getTime() - weekStart.getTime());
  // "Ultimos 7 dias": hoje e os 6 dias anteriores, no fuso do usuario.
  const sevenDaysStart = addLocalDays(startOfTodayUtc(timezone, now), -6, timezone).getTime();

  const msPerDay = new Array<number>(7).fill(0);
  const countPerDay = new Array<number>(7).fill(0);
  let previous = 0;
  const last7 = emptyCounts();

  for (const r of reviews) {
    const t = r.reviewedAt.getTime();
    if (t > now.getTime()) continue;

    const idx = dayIndexOf(r.reviewedAt, days);
    if (idx >= 0) {
      countPerDay[idx]! += 1;
      msPerDay[idx]! += r.durationMs;
    } else if (t >= lastWeekStart.getTime() && t <= lastWeekCutoff) {
      previous += 1;
    }

    if (t >= sevenDaysStart) addRating(last7, r.rating);
  }

  const cardsThisWeek = countPerDay.reduce((a, b) => a + b, 0);
  const totalMs = msPerDay.reduce((a, b) => a + b, 0);

  return {
    weekStart: localDateKey(weekStart, timezone),
    weekStudied: countPerDay.map((c) => c > 0),
    cardsThisWeek,
    cardsDeltaPct:
      previous === 0 ? null : Math.round(((cardsThisWeek - previous) * 100) / previous),
    minutesThisWeek: Math.round(totalMs / 60_000),
    minutesPerDay: msPerDay.map((ms) => Math.round(ms / 60_000)),
    accuracy7d: accuracyPct(last7),
  };
}
