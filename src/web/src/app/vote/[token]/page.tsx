import type { Metadata } from 'next';
import { BallotView } from '@/components/voting/ballot';
import { ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';

export const dynamic = 'force-dynamic';
// A personal link: never indexed.
export const metadata: Metadata = { title: 'Your ballot', robots: { index: false } };

export default async function PassBallotPage({ params }: PageProps<'/vote/[token]'>) {
  const { token } = await params;

  let ballot: Schemas['BallotDto'];
  try {
    ballot = await apiGet<Schemas['BallotDto']>(
      `/api/voting/passes/${encodeURIComponent(token)}/ballot`,
    );
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 404
        ? 'This voting link is not valid. Check that you copied all of it.'
        : e instanceof Error
          ? e.message
          : 'The API is not reachable.';
    return <ErrorState title="No ballot here" message={message} />;
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Vote: {ballot.eventName}</h1>
      <p className="text-sm text-muted">
        This page is your personal ballot: keep its address to come back and change your votes.
      </p>
      <BallotView
        ballot={ballot}
        votesPath={`/api/voting/passes/${encodeURIComponent(token)}/votes`}
      />
    </section>
  );
}
