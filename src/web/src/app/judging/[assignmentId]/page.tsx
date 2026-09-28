import type { Metadata } from 'next';
import Link from 'next/link';
import { Answers } from '@/components/gallery/answers';
import { ReviewForm } from '@/components/judge/review-form';
import { Badge, Card, ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review' };

/** One project to judge: what the team submitted, and your marks. */
export default async function ReviewPage({ params }: PageProps<'/judging/[assignmentId]'>) {
  const { assignmentId } = await params;
  await requireLogin(`/judging/${assignmentId}`);

  let review: Schemas['ReviewDto'];
  try {
    review = await apiGet<Schemas['ReviewDto']>(
      `/api/judge/reviews/${encodeURIComponent(assignmentId)}`,
    );
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 403
        ? 'Judges can open only the projects assigned to them.'
        : e instanceof Error
          ? e.message
          : 'The API is not reachable.';
    return <ErrorState title="This review is not available" message={message} />;
  }

  const p = review.project;
  const links = [
    ['Repository', p.repoUrl],
    ['Demo video', p.demoVideoUrl],
    ['Live site', p.liveUrl],
  ] as const;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/judging" className="text-muted">
          ← Queue
        </Link>
        <span className="text-muted">
          {review.eventName} ·{' '}
          {review.inJudging
            ? `project ${review.position + 1} of ${review.queueLength}`
            : 'withdrawn from judging by the organisers (disqualified or replaced by a newer copy)'}
        </span>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <article className="space-y-3">
          <h1 className="text-2xl font-semibold">{p.title}</h1>
          {p.tagline ? <p className="text-muted">{p.tagline}</p> : null}
          <div className="flex flex-wrap gap-2">
            {p.track ? <Badge>{p.track}</Badge> : null}
            <Badge>Team {p.teamName}</Badge>
            {p.techTags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
          {p.summary ? <p>{p.summary}</p> : null}
          {p.description ? <p className="whitespace-pre-line">{p.description}</p> : null}
          {/* Private answers included: judges see everything the organisers asked. */}
          <Answers answers={p.answers} className="border-t border-border pt-3" />
          <ul className="space-y-1 text-sm">
            {links
              .filter(([, url]) => url)
              .map(([label, url]) => (
                <li key={label}>
                  {/* rel=noopener noreferrer: links are supplied by the team. */}
                  <a href={url!} className="underline" rel="noopener noreferrer" target="_blank">
                    {label}
                  </a>
                </li>
              ))}
          </ul>
        </article>
        <Card>
          <ReviewForm review={review} />
        </Card>
      </div>
    </section>
  );
}
