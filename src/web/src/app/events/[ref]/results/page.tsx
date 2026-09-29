import type { Metadata } from 'next';
import Link from 'next/link';
import { ResultsTable } from '@/components/results/results-table';
import { EmptyState, ErrorState, Eyebrow } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Results' };

/** Public results: visible only once the organisers publish them. */
export default async function ResultsPage({ params }: PageProps<'/events/[ref]/results'>) {
  const { ref } = await params;
  let results: Schemas['PublicResultsDto'];
  try {
    results = await apiGet<Schemas['PublicResultsDto']>(
      `/api/events/${encodeURIComponent(ref)}/results`,
    );
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      return (
        <EmptyState title="Results are not published yet">
          They appear here when the organisers publish them.{' '}
          <Link href="/projects" className="underline">
            Browse the projects
          </Link>
        </EmptyState>
      );
    }
    return (
      <ErrorState
        title="Results could not be loaded"
        message={e instanceof Error ? e.message : 'The API is not reachable.'}
      />
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Eyebrow>Published results</Eyebrow>
        <h1 className="text-3xl font-bold tracking-tight">{results.eventName}: results</h1>
        <p className="max-w-3xl text-muted">
          Each project&apos;s score is corrected for how generous its judges were. Projects in the
          same group ({results.tieGroups} group{results.tieGroups === 1 ? '' : 's'}) cannot be told
          apart by the reviews, so read ranks inside a group as equal.
        </p>
        <p className="font-mono text-xs text-muted">
          Published {formatUtc(results.publishedAt)} · method {results.method}
        </p>
      </div>
      <ResultsTable rows={results.rows} showReasons={false} />
      <details className="rounded-xl border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-medium">Check these results</summary>
        <p className="mt-2 text-muted">
          The ranking records a SHA-256 hash of its inputs (every final review and the rubric) and
          of its result. Anyone with the event&apos;s exports can recompute them.
        </p>
        <p className="mt-2 font-mono text-xs break-all text-muted">
          inputs {results.inputsHash}
          <br />
          result {results.outputHash}
        </p>
      </details>
    </section>
  );
}
