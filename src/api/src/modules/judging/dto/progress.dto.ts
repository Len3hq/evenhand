export class ProgressJudgeDto {
  judgeId: string;
  /** Fixture id (e.g. jdg_07) for judges imported from fixtures.json. */
  externalId: string | null;
  name: string;
  email: string;
  tracks: string[];
  assigned: number;
  finished: number;
  drafts: number;
  notStarted: number;
  /** When they last saved or submitted anything; null if they have not started. */
  lastActivity: string | null;
  /**
   * Gave every project exactly the same marks across 3+ final reviews: their marks say nothing
   * about how projects differ. (Different marks that average out equal are not flagged.)
   */
  flat: boolean;
}

export class ProgressProjectDto {
  projectId: string;
  externalId: string | null;
  title: string;
  track: string | null;
  assigned: number;
  finished: number;
  drafts: number;
}

export class ProgressTotalsDto {
  judges: number;
  /** Judges with work assigned who have not saved anything yet. */
  judgesNotStarted: number;
  projects: number;
  /** Projects with no finished review yet. */
  projectsUnreviewed: number;
  assignments: number;
  finished: number;
  drafts: number;
  notStarted: number;
}

export class ProgressDto {
  generatedAt: string;
  judgingClose: string | null;
  totals: ProgressTotalsDto;
  judges: ProgressJudgeDto[];
  projects: ProgressProjectDto[];
}
