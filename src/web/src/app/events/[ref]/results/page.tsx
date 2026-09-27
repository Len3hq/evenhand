import type { Metadata } from 'next';
import Link from 'next/link';
import { ResultsTable } from '@/components/results/results-table';
import { EmptyState, ErrorState } from '@/components/ui';
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
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{results.eventName}: results</h1>
      <p className="max-w-3xl text-sm text-muted">
        Published {formatUtc(results.publishedAt)}. Each project&apos;s score is corrected for how
        generous its judges were. Projects in the same group ({results.tieGroups} group
        {results.tieGroups === 1 ? '' : 's'}) cannot be told apart by the reviews, so read ranks
        inside a group as equal.
      </p>
      <ResultsTable rows={results.rows} showReasons={false} />
      <p className="font-mono text-xs break-all text-muted">
        Method {results.method} · inputs {results.inputsHash} · result {results.outputHash}
      </p>
    </section>
  );
}
