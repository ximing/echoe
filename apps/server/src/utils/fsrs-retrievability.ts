import { sql } from 'drizzle-orm';

export interface RetrievabilityResult {
  value: number | null;
  isNew: boolean;
}

export const DAY_MS = 86400000;
const RETRIEVABILITY_SCALE = 9;

/**
 * Calculate FSRS retrievability: R(t,S) = (1 + t / (9S))^(-1)
 */
export function calculateRetrievability(
  lastReview: number,
  stability: number,
  nowMs: number
): RetrievabilityResult {
  if (lastReview <= 0 || stability <= 0) {
    return { value: null, isNew: true };
  }

  const elapsedDays = (nowMs - lastReview) / DAY_MS;

  // Future timestamps can appear because of clock drift; treat as just reviewed.
  if (elapsedDays < 0) {
    return { value: 1, isNew: false };
  }

  const value = 1 / (1 + elapsedDays / (RETRIEVABILITY_SCALE * stability));
  return { value: Math.max(0, Math.min(1, value)), isNew: false };
}

/**
 * Build SQL expression for FSRS retrievability, intended for aggregate queries.
 */
export function getRetrievabilitySqlExpr(
  nowMs: number,
  lastReviewExpr: unknown,
  stabilityExpr: unknown
) {
  return sql<number>`POWER(1 + (${nowMs} - ${lastReviewExpr}) / (${RETRIEVABILITY_SCALE} * ${stabilityExpr} * ${DAY_MS}), -1)`;
}
