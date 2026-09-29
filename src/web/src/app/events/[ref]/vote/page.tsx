import type { Metadata } from 'next';
import { BallotView } from '@/components/voting/ballot';
import { ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Vote' };

export default async function VotePage({ params }: PageProps<'/events/[ref]/vote'>) {
  const { ref } = await params;
  await requireLogin(`/events/${ref}/vote`);

  let ballot: Schemas['BallotDto'];
  try {
    ballot = await apiGet<Schemas['BallotDto']>(`/api/events/${encodeURIComponent(ref)}/ballot`);
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 404
        ? 'This event has no community vote.'
        : e instanceof ApiError && e.body?.error === 'wrong_voting_mode'
          ? 'This vote is by personal link: use the link the organisers sent or shared.'
          : e instanceof Error
            ? e.message
            : 'The API is not reachable.';
    return <ErrorState title="No ballot here" message={message} />;
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Vote: {ballot.eventName}</h1>
      <BallotView ballot={ballot} votesPath={`/api/events/${ballot.eventSlug}/ballot/votes`} />
    </section>
  );
}
