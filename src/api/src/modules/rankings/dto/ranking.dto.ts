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
  tieGroups: number;
  rows: RankingRowDto[];
}
