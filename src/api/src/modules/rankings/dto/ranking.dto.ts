export class RankingRowDto {
  projectId: string;
  externalId: string | null;
  title: string;
  teamName: string;
  track: string | null;
  /** 1… for ranked projects; null when there is too little evidence to rank it. */
  rank: number | null;
  /** Projects in one group cannot be told apart by the data; null when not ranked. */
  tieGroup: number | null;
  reviews: number;
  rawMean: number;
  normalized: number;
  /** Uncertainty of `normalized` (posterior standard deviation). */
  sd: number;
  /** Rank by raw mean minus rank by normalized score (positive: moved up). */
  move: number | null;
  /** Why the normalized score differs from the raw mean, in one line. */
  reason: string;
}

/** A suspected duplicate still waiting for the organisers' decision when the run was made. */
export class PendingDuplicateDto {
  flagId: string;
  reason: 'SAME_TEAM' | 'SAME_REPO' | 'SAME_TITLE';
  /** The newer entry (kept if confirmed). */
  kept: string;
  /** The older entry. While held (same team), it is out of judging and its reviews are not ranked. */
  held: string;
  /** Final reviews of the older entry that this run could not use. */
  heldOutReviews: number;
}

export class RankingParamsDto {
  method: string;
  weights: Record<string, number>;
  lambdaB: number;
  lambdaQ: number;
  /** The chosen λ sits on the edge of the searched grid. */
  atEdge: boolean;
  looMse: number;
  /** Leave-one-out error of predicting every review by the mean of the others. */
  meanOnlyLooMse: number;
  reviews: number;
  /** Projects in judging with no final review; not in the ranking. */
  unreviewed: string[];
  /**
   * Duplicates not yet decided when the run was made. A run can be computed with some pending,
   * but not published (409 `duplicates_pending`): decide them on the entries page first.
   * Absent on runs made before this was recorded.
   */
  pendingDuplicates?: PendingDuplicateDto[];
  /**
   * Projects whose team changed them after some of their final reviews were submitted: those
   * judges scored an earlier version. Shown, not blocking. Absent on older runs.
   */
  changedAfterReview?: ChangedAfterReviewDto[];
}

export class ChangedAfterReviewDto {
  project: string;
  /** Final reviews that scored an earlier version. */
  reviews: number;
}

export class RankingSummaryDto {
  id: string;
  eventId: string;
  createdAt: string;
  publishedAt: string | null;
  /** SHA-256 of the canonical inputs (reviews and weights) and of the canonical result. */
  inputsHash: string;
  outputHash: string;
  /** False once the event's final reviews or weights have changed since this run. */
  current: boolean;
  params: RankingParamsDto;
}

export class RankingDto extends RankingSummaryDto {
  rows: RankingRowDto[];
}

export class PublicResultsDto {
  eventId: string;
  eventName: string;
  publishedAt: string;
  method: string;
  /** Anyone can recompute these from the exported data to check the published result. */
  inputsHash: string;
  outputHash: string;
  /**
   * The audit chain's head when these results were published: anyone can note it down.
   * Null for results published before anchoring existed.
   */
  auditHead: string | null;
  /**
   * Checked now: is that hash still in the audit log? False means history was rewritten after
   * publication. Null when there is no anchor.
   */
  auditHeadInLog: boolean | null;
  tieGroups: number;
  rows: RankingRowDto[];
}
