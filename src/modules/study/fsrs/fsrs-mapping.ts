import { createEmptyCard, Rating, State, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import { CardLearningState, ReviewRating } from '../../../generated/prisma/enums';

// Errei -> Again, Dificil -> Hard, Facil -> Good. Nao existe Easy por enquanto.
const RATING_TO_GRADE: Record<ReviewRating, Grade> = {
  [ReviewRating.AGAIN]: Rating.Again,
  [ReviewRating.HARD]: Rating.Hard,
  [ReviewRating.GOOD]: Rating.Good,
};

const STATE_TO_PRISMA: Record<State, CardLearningState> = {
  [State.New]: CardLearningState.NEW,
  [State.Learning]: CardLearningState.LEARNING,
  [State.Review]: CardLearningState.REVIEW,
  [State.Relearning]: CardLearningState.RELEARNING,
};

const PRISMA_TO_STATE: Record<CardLearningState, State> = {
  [CardLearningState.NEW]: State.New,
  [CardLearningState.LEARNING]: State.Learning,
  [CardLearningState.REVIEW]: State.Review,
  [CardLearningState.RELEARNING]: State.Relearning,
};

export function toGrade(rating: ReviewRating): Grade {
  return RATING_TO_GRADE[rating];
}

export function toPrismaState(state: State): CardLearningState {
  return STATE_TO_PRISMA[state];
}

export function toFsrsState(state: CardLearningState): State {
  return PRISMA_TO_STATE[state];
}

// Campos de CardState (Prisma) que espelham o Card do ts-fsrs.
export interface StoredCardState {
  state: CardLearningState;
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReview: Date | null;
}

// Primeiro estudo de um card: createEmptyCard(). Depois, o estado gravado.
export function toFsrsCard(stored: StoredCardState | null, now: Date): FsrsCard {
  if (!stored) {
    return createEmptyCard(now);
  }
  const card: FsrsCard = {
    due: stored.due,
    stability: stored.stability,
    difficulty: stored.difficulty,
    elapsed_days: stored.elapsedDays,
    scheduled_days: stored.scheduledDays,
    learning_steps: stored.learningSteps,
    reps: stored.reps,
    lapses: stored.lapses,
    state: toFsrsState(stored.state),
  };
  if (stored.lastReview) card.last_review = stored.lastReview;
  return card;
}

export function fromFsrsCard(card: FsrsCard): StoredCardState {
  return {
    state: toPrismaState(card.state),
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    lastReview: card.last_review ?? null,
  };
}
