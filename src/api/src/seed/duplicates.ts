/**
 * Duplicate submission detection (BUILD-PLAN §8). Pure, so it is unit-tested on its own and
 * reused by both the fixture importer and (later) the submit path.
 *
 * Rules, strongest first:
 * - SAME_TEAM: two submissions from one team.      → flag; the earlier one is put on hold.
 * - SAME_REPO: same repository URL, different team. → flag.
 * - SAME_TITLE: same title only.                    → flag as a warning.
 * The later submission is the one proposed to keep (the user's decision: keep the latest).
 */
export type DuplicateReason = 'SAME_TEAM' | 'SAME_REPO' | 'SAME_TITLE';

export interface DuplicateCandidate {
  id: string;
  team: string;
  title: string;
  repoUrl: string;
  submittedAt: string;
}

export interface DuplicatePair {
  keptId: string;
  supersededId: string;
  reason: DuplicateReason;
}

export function normaliseTitle(title: string): string {
  return title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normaliseRepo(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
}

export function detectDuplicates(items: readonly DuplicateCandidate[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!;
      const b = items[j]!;
      const reason = reasonFor(a, b);
      if (!reason) continue;
      // Keep the later submission; on an exact tie keep the one listed later.
      const [earlier, later] =
        Date.parse(a.submittedAt) <= Date.parse(b.submittedAt) ? [a, b] : [b, a];
      pairs.push({ keptId: later.id, supersededId: earlier.id, reason });
    }
  }
  return pairs;
}

function reasonFor(a: DuplicateCandidate, b: DuplicateCandidate): DuplicateReason | null {
  if (a.team === b.team) return 'SAME_TEAM';
  if (a.repoUrl && normaliseRepo(a.repoUrl) === normaliseRepo(b.repoUrl)) return 'SAME_REPO';
  if (normaliseTitle(a.title) === normaliseTitle(b.title)) return 'SAME_TITLE';
  return null;
}
