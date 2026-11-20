import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fsrs, generatorParameters, type FSRS, type FSRSParameters } from 'ts-fsrs';
import type { Env } from '../../../config/env';
import type { ReviewRating } from '../../../generated/prisma/enums';
import { fromFsrsCard, toFsrsCard, toGrade, type StoredCardState } from './fsrs-mapping';

export function buildFsrsParameters(config: ConfigService<Env, true>): FSRSParameters {
  const overrides: Partial<FSRSParameters> = {
    enable_fuzz: config.get('FSRS_ENABLE_FUZZ', { infer: true }),
  };
  const retention = config.get('FSRS_REQUEST_RETENTION', { infer: true });
  if (retention !== undefined) overrides.request_retention = retention;
  const maxInterval = config.get('FSRS_MAXIMUM_INTERVAL', { infer: true });
  if (maxInterval !== undefined) overrides.maximum_interval = maxInterval;
  const weights = config.get('FSRS_WEIGHTS', { infer: true });
  if (weights !== undefined) overrides.w = weights;
  return generatorParameters(overrides);
}

// Aplica uma avaliacao: devolve o novo estado do card. `now` e sempre o relogio do servidor.
export function applyReview(
  scheduler: FSRS,
  stored: StoredCardState | null,
  rating: ReviewRating,
  now: Date,
): StoredCardState {
  const { card } = scheduler.next(toFsrsCard(stored, now), now, toGrade(rating));
  return fromFsrsCard(card);
}

// Uma instancia de fsrs() para a API inteira, com os parametros da config.
@Injectable()
export class FsrsService {
  private readonly scheduler: FSRS;

  constructor(config: ConfigService<Env, true>) {
    this.scheduler = fsrs(buildFsrsParameters(config));
  }

  review(stored: StoredCardState | null, rating: ReviewRating, now: Date): StoredCardState {
    return applyReview(this.scheduler, stored, rating, now);
  }
}
