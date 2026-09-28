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
