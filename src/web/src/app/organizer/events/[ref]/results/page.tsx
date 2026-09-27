import type { Metadata } from 'next';
import Link from 'next/link';
import { RankingPanel } from '@/components/organizer/ranking-panel';
import { ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Results' };

export default async function OrganizerResultsPage({
  params,
}: PageProps<'/organizer/events/[ref]/results'>) {
  const { ref } = await params;
  await requireLogin(`/organizer/events/${ref}/results`);

  let event: Schemas['EventDto'];
  let latest: Schemas['RankingDto'] | null = null;
  try {
    event = await apiGet<Schemas['EventDto']>(`/api/events/${encodeURIComponent(ref)}`);
    const runs = await apiGet<Schemas['RankingSummaryDto'][]>(`/api/events/${event.id}/rankings`);
    if (runs[0]) latest = await apiGet<Schemas['RankingDto']>(`/api/rankings/${runs[0].id}`);
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 403
        ? 'Only the event’s organisers and admins can rank and publish it.'
        : e instanceof ApiError && e.status === 404
          ? 'There is no such event.'
          : e instanceof Error
            ? e.message
            : 'The API is not reachable.';
    return <ErrorState title="Results are not available" message={message} />;
  }

  return (
    <section className="space-y-4">
      <Link href={`/organizer/events/${event.slug}`} className="text-sm text-muted">
        ← {event.name}
      </Link>
      <h1 className="text-2xl font-semibold">Ranking and results</h1>
      <p className="max-w-3xl text-sm text-muted">
        Scores are corrected for each judge&apos;s leniency (the method is in JUDGING.md). Projects
        in one tie group cannot be told apart by the reviews; projects with a single review are
        listed, not ranked. Each run records hashes of its inputs and result, so published results
        can be checked.
      </p>
      <RankingPanel
        eventId={event.id}
        eventSlug={event.slug}
        latest={latest}
        published={event.resultsPublishedAt !== null}
      />
    </section>
  );
}
