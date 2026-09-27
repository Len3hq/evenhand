'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ResultsTable } from '@/components/results/results-table';
import { Badge, Button, EmptyState, ErrorState } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';

type Ranking = Schemas['RankingDto'];

/**
 * Run a ranking, read its receipt, publish it. The API refuses to publish a run the data has
 * moved on from, and says so; this panel shows the same state up front.
 */
export function RankingPanel({
  eventId,
  eventSlug,
  latest,
  published,
}: {
  eventId: string;
  eventSlug: string;
  latest: Ranking | null;
  published: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const p = latest?.params;
  const gain = p && p.meanOnlyLooMse > 0 ? (1 - p.looMse / p.meanOnlyLooMse) * 100 : null;
  const groups = latest
    ? new Set(latest.rows.flatMap((r) => (r.tieGroup ? [r.tieGroup] : []))).size
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={busy}
          onClick={() => act(() => apiPost(`/api/events/${eventId}/rankings`))}
        >
          {busy ? 'Working…' : 'Run ranking'}
        </Button>
        {latest && !latest.publishedAt ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !latest.current}
            onClick={() => {
              if (window.confirm('Publish this ranking? It becomes the public results.')) {
                void act(() => apiPost(`/api/rankings/${latest.id}/publish`));
              }
            }}
          >
            Publish these results
          </Button>
        ) : null}
        {published ? (
          <Link href={`/events/${eventSlug}/results`} className="text-sm underline">
            Public results
          </Link>
        ) : null}
      </div>
      {error ? <ErrorState title="Not done" message={error} /> : null}

      {!latest ? (
        <EmptyState title="No ranking yet">
          Run one once judges have submitted reviews. You can run it as often as you like; only what
          you publish is public.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Run {formatUtc(latest.createdAt)}</span>
            {latest.publishedAt ? (
              <Badge>Published {formatUtc(latest.publishedAt)}</Badge>
            ) : latest.current ? (
              <Badge>Not published</Badge>
            ) : (
              <Badge tone="warning">Out of date: reviews or weights changed. Run it again.</Badge>
            )}
          </div>
          <p className="text-sm text-muted">
            {latest.rows.filter((r) => r.rank !== null).length} projects ranked in {groups} tie
            group{groups === 1 ? '' : 's'} from {p?.reviews} reviews (λ_b {p?.lambdaB}, λ_q{' '}
            {p?.lambdaQ}
            {p?.atEdge ? ', on the edge of the searched range' : ''}).{' '}
            {gain !== null
              ? `The model predicts a held-out review ${gain.toFixed(1)}% better than the overall mean does${gain < 5 ? ': the reviews say little about which project is better, so read the tie groups, not single ranks' : ''}.`
              : ''}
          </p>
          <ResultsTable rows={latest.rows} showReasons />
          <p className="font-mono text-xs break-all text-muted">
            inputs {latest.inputsHash} · result {latest.outputHash}
          </p>
        </div>
      )}
    </div>
  );
}
