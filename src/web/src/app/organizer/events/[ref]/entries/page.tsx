import type { Metadata } from 'next';
import Link from 'next/link';
import { DuplicatesPanel } from '@/components/organizer/duplicates-panel';
import { EntriesTable } from '@/components/organizer/entries-table';
import { ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Entries and duplicates' };

export default async function EntriesPage({
  params,
}: PageProps<'/organizer/events/[ref]/entries'>) {
  const { ref } = await params;
  await requireLogin(`/organizer/events/${ref}/entries`);

  let event: Schemas['EventDto'];
  let entries: Schemas['EntryDto'][];
  let duplicates: Schemas['DuplicateDto'][];
  try {
    event = await apiGet<Schemas['EventDto']>(`/api/events/${encodeURIComponent(ref)}`);
    [entries, duplicates] = await Promise.all([
      apiGet<Schemas['EntryDto'][]>(`/api/events/${event.id}/submissions`),
      apiGet<Schemas['DuplicateDto'][]>(`/api/events/${event.id}/duplicates`),
    ]);
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 403
        ? 'Only the event’s organisers and admins can manage its entries.'
        : e instanceof ApiError && e.status === 404
          ? 'There is no such event.'
          : e instanceof Error
            ? e.message
            : 'The API is not reachable.';
    return <ErrorState title="Entries are not available" message={message} />;
  }

  const pending = duplicates.filter((d) => d.status === 'PENDING').length;
  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <Link href={`/organizer/events/${event.slug}`} className="text-sm text-muted">
          ← {event.name}
        </Link>
        <h1 className="text-2xl font-semibold">Entries and duplicates</h1>
        <p className="max-w-3xl text-sm text-muted">
          Every decision here is written to the{' '}
          <Link href={`/organizer/events/${event.slug}/audit`} className="underline">
            audit trail
          </Link>{' '}
          and can be undone. Each one changes the reviews a ranking reads, so{' '}
          <Link href={`/organizer/events/${event.slug}/results`} className="underline">
            run the ranking
          </Link>{' '}
          again before publishing.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">
          Suspected duplicates{pending ? ` (${pending} waiting)` : ''}
        </h2>
        <DuplicatesPanel duplicates={duplicates} />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Submitted entries ({entries.length})</h2>
        <EntriesTable entries={entries} />
      </div>
    </section>
  );
}
