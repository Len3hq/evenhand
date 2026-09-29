import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Projects in judging: submitted, eligible, not a held or replaced duplicate copy. The one
 * definition used by assignment, the judge console, progress and rankings, so a project an
 * organiser disqualifies or merges leaves all of them at once.
 */
export const IN_JUDGING = {
  status: 'SUBMITTED',
  eligibility: 'ELIGIBLE',
  supersededById: null,
  duplicateHold: false,
} as const;

/**
 * Track isolation: a project a judge may see is in no track, or in a track their judge role in
 * that event covers *now*. A track belongs to one event and a user holds at most one judge role
 * per event, so "a judge_tracks row of this user's judge role" pins it to the right event.
 * Combine with an ownership check ("this user's assignment"); it never grants access alone.
 */
export const coveredBy = (userId: string): Prisma.SubmissionWhereInput => ({
  OR: [
    { trackId: null },
    { track: { judgeTracks: { some: { judgeRole: { userId, role: 'JUDGE' } } } } },
  ],
});
