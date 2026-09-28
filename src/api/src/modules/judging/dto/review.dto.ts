import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SaveReviewDto {
  /**
   * Marks by criterion key. A draft may leave some out (or send null to clear one); each mark
   * must be a whole number inside its criterion's range.
   */
  @IsObject()
  values: Record<string, number | null>;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}

export type ReviewState = 'NOT_STARTED' | 'DRAFT' | 'FINAL';

export class QueueItemDto {
  assignmentId: string;
  /** Position in this judge's queue for the event, from 0. */
  position: number;
  projectId: string;
  title: string;
  track: string | null;
  state: ReviewState;
}

export class QueueEventDto {
  eventId: string;
  eventName: string;
  eventSlug: string;
  judgingClose: string | null;
  /** False once judging has closed: reviews can then no longer change. */
  judgingOpen: boolean;
  assigned: number;
  finished: number;
  items: QueueItemDto[];
}

export class JudgeQueueDto {
  events: QueueEventDto[];
}

export class ReviewCriterionDto {
  key: string;
  label: string;
  min: number;
  max: number;
  /** Share of the score, weight / sum of weights. */
  share: number;
}

export class ReviewProjectDto {
  id: string;
  title: string;
  tagline: string | null;
  summary: string | null;
  description: string | null;
  repoUrl: string | null;
  demoVideoUrl: string | null;
  liveUrl: string | null;
  techTags: string[];
  track: string | null;
  teamName: string;
}

export class ReviewDto {
  assignmentId: string;
  eventId: string;
  eventName: string;
  /** Place in the queue from 0; -1 when the project is no longer in judging. */
  position: number;
  /** Assignments in this judge's queue for the event (projects still in judging). */
  queueLength: number;
  previousAssignmentId: string | null;
  nextAssignmentId: string | null;
  judgingOpen: boolean;
  /**
   * False once the project was disqualified or replaced by a newer copy: the review can be
   * read but not changed (409 `not_in_judging`).
   */
  inJudging: boolean;
  project: ReviewProjectDto;
  criteria: ReviewCriterionDto[];
  state: ReviewState;
  values: Record<string, number>;
  comment: string;
  /** Weighted score once every criterion is marked, else null. */
  weightedScore: number | null;
  submittedAt: string | null;
}
