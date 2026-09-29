import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Where a submitted entry stands: in judging, the held older copy of a pending duplicate,
 * replaced by a confirmed duplicate, or disqualified.
 */
export type EntryState = 'IN_JUDGING' | 'HELD' | 'REPLACED' | 'DISQUALIFIED';

/** A submitted entry as its event's organisers see it. */
export class EntryDto {
  id: string;
  /** Fixture id (e.g. prj_07) when imported from fixtures.json. */
  externalId: string | null;
  title: string;
  teamName: string;
  track: string | null;
  repoUrl: string | null;
  submittedAt: string | null;
  state: EntryState;
  /** Why it was disqualified; null unless disqualified. */
  disqualifyReason: string | null;
  /** Final reviews that count (reviews set aside by a duplicate merge are not counted). */
  finalReviews: number;
  /**
   * Of those, how many scored an earlier version: the team changed the entry after the judge
   * submitted (allowed until the deadline). 0 for reviews imported from fixtures.json.
   */
  changedAfterReview: number;
}

/** Whose reviews a duplicate decision moves across and whose it sets aside, by judge name. */
export class DuplicateMergeDto {
  /** Judges who reviewed only the older copy: their reviews move to the kept entry. */
  moved: string[];
  /** Judges who reviewed both copies: their review of the older copy no longer counts. */
  setAside: string[];
}

export class DuplicateDto {
  id: string;
  eventId: string;
  /** SAME_TEAM: one team submitted twice. SAME_REPO / SAME_TITLE: two teams, one project? */
  reason: 'SAME_TEAM' | 'SAME_REPO' | 'SAME_TITLE';
  status: 'PENDING' | 'CONFIRMED' | 'DISMISSED';
  /** The newer copy, kept when the duplicate is confirmed. */
  kept: EntryDto;
  /** The older copy, replaced when the duplicate is confirmed. */
  superseded: EntryDto;
  /** Pending: what confirming would do. Confirmed: what it did. Dismissed: nothing. */
  merge: DuplicateMergeDto;
  /** Confirming or dismissing this is refused, and why (null when it is allowed). */
  blockedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export class DisqualifyDto {
  /** Shown to the team and recorded in the audit trail. */
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
