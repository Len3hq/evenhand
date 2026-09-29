import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';

/** What a judge sees of a submission, beyond its own columns: answers and images. */
export const CONTENT_INCLUDE = {
  answers: { select: { questionId: true, value: true } },
  images: { select: { id: true } },
} satisfies Prisma.SubmissionInclude;

type ContentRow = Prisma.SubmissionGetPayload<{ include: typeof CONTENT_INCLUDE }>;

/**
 * SHA-256 of everything a judge scores: text, links, tags, track, custom answers and images.
 * Stored on a review when it is submitted, so organisers can see which reviews scored a version
 * the team has changed since (teams may edit until the deadline; judging can start earlier).
 */
export function contentHash(s: ContentRow): string {
  const content = {
    title: s.title,
    tagline: s.tagline,
    summary: s.summary,
    description: s.description,
    repoUrl: s.repoUrl,
    demoVideoUrl: s.demoVideoUrl,
    liveUrl: s.liveUrl,
    techTags: [...s.techTags].sort(),
    trackId: s.trackId,
    answers: s.answers
      .map((a) => [a.questionId, a.value])
      .sort(([a], [b]) => (a! < b! ? -1 : a! > b! ? 1 : 0)),
    images: s.images.map((i) => i.id).sort(),
  };
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

/** Final, counted reviews that scored a different version than the current one. */
export function reviewsOfOlderVersion(
  s: ContentRow & {
    assignments: {
      review: { status: string; superseded: boolean; contentHash: string | null } | null;
    }[];
  },
): number {
  const now = contentHash(s);
  return s.assignments.filter(
    (a) =>
      a.review?.status === 'FINAL' &&
      !a.review.superseded &&
      a.review.contentHash !== null &&
      a.review.contentHash !== now,
  ).length;
}
