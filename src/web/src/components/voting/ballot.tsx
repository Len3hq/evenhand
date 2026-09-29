'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, ErrorState, ProjectTile } from '@/components/ui';
import { apiDelete, apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';

type Ballot = Schemas['BallotDto'];

/**
 * A voter's ballot: the event's public projects in this ballot's own order, each with a Vote or
 * Withdraw button. `votesPath` is where votes go (the account ballot or a personal link); the
 * API decides whether a vote counts, and its answer is shown as is.
 */
export function BallotView({ ballot, votesPath }: { ballot: Ballot; votesPath: `/api/${string}` }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {ballot.open ? (
          <Badge tone="success">Open until {formatUtc(ballot.closesAt)}</Badge>
        ) : ballot.closed ? (
          <Badge>Voting closed {formatUtc(ballot.closesAt)}</Badge>
        ) : (
          <Badge tone="warning">Voting opens {formatUtc(ballot.opensAt)}</Badge>
        )}
        <span role="status" className="font-mono text-xs text-muted">
          {ballot.votesLeft} of {ballot.votesPerVoter} vote{ballot.votesPerVoter === 1 ? '' : 's'}{' '}
          left
        </span>
      </div>
      <p className="text-sm text-muted">
        Vote for up to {ballot.votesPerVoter} different project
        {ballot.votesPerVoter === 1 ? '' : 's'}. Projects are listed in an order of your own, so
        none gains from being first. You can withdraw a vote and choose again while voting is open.
      </p>
      {error ? <ErrorState title="Not counted" message={error} /> : null}
      {ballot.projects.length === 0 ? (
        <p className="text-sm text-muted">There are no projects in this vote yet.</p>
      ) : (
        <ol className="space-y-3">
          {ballot.projects.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-4 rounded-xl border bg-surface p-3 ${p.voted ? 'border-accent' : 'border-border'}`}
            >
              {p.thumbnailUrl ? (
                <Image
                  src={p.thumbnailUrl}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-md object-cover"
                />
              ) : (
                <ProjectTile title={p.title} />
              )}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/projects/${p.id}`}
                  className="font-semibold underline-offset-4 hover:underline"
                >
                  {p.title}
                </Link>
                <p className="truncate text-sm text-muted">
                  {p.teamName}
                  {p.track ? ` · ${p.track}` : ''}
                  {p.tagline ? ` · ${p.tagline}` : ''}
                </p>
              </div>
              <div className="shrink-0">
                {p.own ? (
                  <Badge>Your team</Badge>
                ) : p.voted ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || !ballot.open}
                    aria-label={`Withdraw your vote for ${p.title}`}
                    onClick={() =>
                      void act(() => apiDelete(`${votesPath}/${encodeURIComponent(p.id)}`))
                    }
                  >
                    ✓ Voted · Withdraw
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={busy || !ballot.open || ballot.votesLeft === 0}
                    aria-label={`Vote for ${p.title}`}
                    onClick={() => void act(() => apiPost(votesPath, { project: p.id }))}
                  >
                    Vote
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
