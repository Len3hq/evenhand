export class JudgeRefDto {
  /** Internal judge id (the judge's EventRole id). */
  id: string;
  /** Fixture id, e.g. jdg_24. */
  externalId: string | null;
  name: string;
}

export class ProjectRefDto {
  id: string;
  externalId: string | null;
  title: string;
}

export class ScoreDto {
  reviewId: string;
  eventId: string;
  judge: JudgeRefDto;
  project: ProjectRefDto;
  status: 'DRAFT' | 'FINAL';
  /** True when the review belonged to a merged duplicate; excluded from ranking. */
  superseded: boolean;
  comment: string;
  /** Raw criterion values keyed by criterion key. */
  values: Record<string, number>;
  /** Weighted score on the criterion scale; null while the review is incomplete. */
  weightedScore: number | null;
}

export class ScoreListDto {
  items: ScoreDto[];
}
