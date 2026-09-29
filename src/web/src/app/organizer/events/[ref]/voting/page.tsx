import type { Metadata } from 'next';
import Link from 'next/link';
import { VotingPanel } from '@/components/organizer/voting-panel';
import { Card, ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Community vote' };

export default async function VotingPage({ params }: PageProps<'/organizer/events/[ref]/voting'>) {
  const { ref } = await params;
  await requireLogin(`/organizer/events/${ref}/voting`);

  let event: Schemas['EventDto'];
  let admin: Schemas['VotingAdminDto'];
  try {
    event = await apiGet<Schemas['EventDto']>(`/api/events/${encodeURIComponent(ref)}`);
    admin = await apiGet<Schemas['VotingAdminDto']>(`/api/events/${event.id}/voting`);
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 403
        ? 'Only the event’s organisers and admins can run its community vote.'
        : e instanceof ApiError && e.status === 404
          ? 'There is no such event.'
          : e instanceof Error
            ? e.message
            : 'The API is not reachable.';
    return <ErrorState title="The community vote is not available" message={message} />;
  }

  return (
    <section className="space-y-4">
      <Link href={`/organizer/events/${event.slug}`} className="text-sm text-muted">
        ← {event.name}
      </Link>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Community vote</h1>
        <p className="max-w-3xl text-sm text-muted">
          A people’s choice, kept apart from judging: it never changes the judged ranking. Voters
          see the public projects in an order of their own and vote while the window is open.
        </p>
      </div>
      <Card>
        <VotingPanel eventId={event.id} eventSlug={event.slug} admin={admin} />
      </Card>
    </section>
  );
}
