import { fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import { CardLearningState, ReviewRating } from '../../../generated/prisma/enums';
import {
  fromFsrsCard,
  toFsrsCard,
  toFsrsState,
  toGrade,
  toPrismaState,
  type StoredCardState,
} from './fsrs-mapping';
import { applyReview } from './fsrs.service';

const MIN = 60_000;

describe('mapeamento das notas para o FSRS', () => {
  it('Errei -> Again, Dificil -> Hard, Facil -> Good', () => {
    expect(toGrade(ReviewRating.AGAIN)).toBe(Rating.Again);
    expect(toGrade(ReviewRating.HARD)).toBe(Rating.Hard);
    expect(toGrade(ReviewRating.GOOD)).toBe(Rating.Good);
  });

  it('nenhuma nota vira Easy nem Manual', () => {
    const grades = Object.values(ReviewRating).map(toGrade);
    expect(grades).not.toContain(Rating.Easy);
    expect(grades).not.toContain(Rating.Manual);
  });

  it('estados do ts-fsrs <-> CardLearningState (ida e volta)', () => {
    expect(toPrismaState(State.New)).toBe(CardLearningState.NEW);
    expect(toPrismaState(State.Learning)).toBe(CardLearningState.LEARNING);
    expect(toPrismaState(State.Review)).toBe(CardLearningState.REVIEW);
    expect(toPrismaState(State.Relearning)).toBe(CardLearningState.RELEARNING);
    for (const s of Object.values(CardLearningState)) {
      expect(toPrismaState(toFsrsState(s))).toBe(s);
    }
  });

  it('sem CardState, o primeiro estudo parte de createEmptyCard()', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    const card = toFsrsCard(null, now);
    expect(card.state).toBe(State.New);
    expect(card.due.toISOString()).toBe(now.toISOString());
    expect(card.reps).toBe(0);
  });

  it('CardState gravado -> Card do ts-fsrs -> CardState sem perder campos', () => {
    const stored: StoredCardState = {
      state: CardLearningState.REVIEW,
      due: new Date('2026-11-20T12:00:00Z'),
      stability: 12.5,
      difficulty: 4.2,
      elapsedDays: 3,
      scheduledDays: 9,
      learningSteps: 0,
      reps: 5,
      lapses: 1,
      lastReview: new Date('2026-11-11T12:00:00Z'),
    };
    expect(fromFsrsCard(toFsrsCard(stored, new Date()))).toEqual(stored);
  });
});

describe('applyReview (ts-fsrs com parametros padrao, sem fuzz)', () => {
  const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));
  const now = new Date('2026-11-16T12:00:00Z');

  it.each([
    [ReviewRating.AGAIN, 1],
    [ReviewRating.HARD, 6],
    [ReviewRating.GOOD, 10],
  ])('card novo + %s -> LEARNING, volta em %i min', (rating, minutes) => {
    const next = applyReview(scheduler, null, rating, now);
    expect(next.state).toBe(CardLearningState.LEARNING);
    expect(next.due.getTime() - now.getTime()).toBe(minutes * MIN);
    expect(next.reps).toBe(1);
    expect(next.lastReview?.toISOString()).toBe(now.toISOString());
  });

  it('Facil duas vezes gradua o card para REVIEW com intervalo em dias', () => {
    const first = applyReview(scheduler, null, ReviewRating.GOOD, now);
    const later = new Date(now.getTime() + 10 * MIN);
    const second = applyReview(scheduler, first, ReviewRating.GOOD, later);
    expect(second.state).toBe(CardLearningState.REVIEW);
    expect(second.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it('Errei num card em revisao vira RELEARNING e conta um lapso', () => {
    const first = applyReview(scheduler, null, ReviewRating.GOOD, now);
    const second = applyReview(
      scheduler,
      first,
      ReviewRating.GOOD,
      new Date(now.getTime() + 10 * MIN),
    );
    const lapse = applyReview(scheduler, second, ReviewRating.AGAIN, second.due);
    expect(lapse.state).toBe(CardLearningState.RELEARNING);
    expect(lapse.lapses).toBe(1);
  });
});
