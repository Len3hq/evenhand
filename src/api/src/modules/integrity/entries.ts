import type { Prisma } from '../../generated/prisma/client.js';
import { CONTENT_INCLUDE, reviewsOfOlderVersion } from '../submissions/content-hash.js';
import type { EntryDto, EntryState } from './dto/integrity.dto.js';

/** What an entry needs to be shown to organisers. */
export const ENTRY_INCLUDE = {
  ...CONTENT_INCLUDE,
  team: { select: { name: true } },
  track: { select: { name: true } },
  assignments: {
    select: { review: { select: { status: true, superseded: true, contentHash: true } } },
  },
} satisfies Prisma.SubmissionInclude;

export type EntryRow = Prisma.SubmissionGetPayload<{ include: typeof ENTRY_INCLUDE }>;

export function entryState(s: {
  eligibility: 'ELIGIBLE' | 'DISQUALIFIED';
  supersededById: string | null;
  duplicateHold: boolean;
}): EntryState {
  if (s.eligibility === 'DISQUALIFIED') return 'DISQUALIFIED';
  if (s.supersededById) return 'REPLACED';
  if (s.duplicateHold) return 'HELD';
  return 'IN_JUDGING';
}

export function toEntry(s: EntryRow): EntryDto {
  return {
    id: s.id,
    externalId: s.externalId,
    title: s.title,
    teamName: s.team.name,
    track: s.track?.name ?? null,
    repoUrl: s.repoUrl,
    submittedAt: s.submittedAt?.toISOString() ?? null,
    state: entryState(s),
    disqualifyReason: s.disqualifyReason,
    finalReviews: s.assignments.filter((a) => a.review?.status === 'FINAL' && !a.review.superseded)
      .length,
    changedAfterReview: reviewsOfOlderVersion(s),
  };
}

/** "prj_07 Dry Harbour": how the audit trail names an entry. */
export const label = (s: { externalId: string | null; title: string }): string =>
  s.externalId ? `${s.externalId} ${s.title}` : s.title;
