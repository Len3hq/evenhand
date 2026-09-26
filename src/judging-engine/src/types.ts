/**
 * Input and output types for the judging engine.
 *
 * The engine never sees database rows. The API maps rows into these plain shapes,
 * calls a pure function, and stores the result. Identifiers are opaque strings.
 */

/** One rubric criterion as configured by the organiser. */
export interface Criterion {
  key: string;
  /** Relative weight; weights are normalised by their sum, so they need not add up to 1. */
  weight: number;
  min: number;
  max: number;
}

/** One judge's review of one project: raw per-criterion values keyed by criterion key. */
export interface ReviewInput {
  judgeId: string;
  projectId: string;
  values: Readonly<Record<string, number>>;
}

/** A review reduced to a single weighted score on the criterion scale. */
export interface WeightedReview {
  judgeId: string;
  projectId: string;
  score: number;
}
