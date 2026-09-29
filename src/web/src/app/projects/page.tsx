import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectCard } from '@/components/gallery/project-card';
import { GalleryFilters } from '@/components/gallery/gallery-filters';
import { Badge, ButtonLink, EmptyState, ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';

// Always render at request time: the gallery changes as teams submit, and `next build`
// must not need the API.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Gallery' };

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export default async function GalleryPage({ searchParams }: PageProps<'/projects'>) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() ?? '';
  const tag = first(sp.tag) ?? '';
  const eventRef = first(sp.event) ?? '';
  const page = Math.max(1, Number(first(sp.page)) || 1);

  let data: Schemas['ProjectPageDto'];
  let events: Schemas['EventDto'][];
  let tracks: Schemas['EventTrackDto'][] = [];
  const query = new URLSearchParams({ page: String(page) });
  try {
    events = (await apiGet<Schemas['EventPageDto']>('/api/events?pageSize=100')).items;
    const event = events.find((e) => e.id === eventRef || e.slug === eventRef);
    if (event) {
      tracks = (await apiGet<Schemas['EventDetailDto']>(`/api/events/${event.id}`)).tracks;
      query.set('event', event.slug);
    }
    // A track only filters within its own event; a stale one from another event is dropped.
    const track = tracks.find((t) => t.id === first(sp.track));
    if (track) query.set('track', track.id);
    if (q) query.set('q', q);
    if (tag) query.set('tag', tag);
    data = await apiGet<Schemas['ProjectPageDto']>(`/api/projects?${query.toString()}`);
  } catch (e) {
    return (
      <ErrorState
        title="The gallery could not be loaded"
        message={e instanceof ApiError ? e.message : 'The API is not reachable. Is it running?'}
      />
    );
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  // Event names for the cards, from the list the filter already loaded (no extra request).
  const eventNames = new Map(events.map((e) => [e.id, e.name]));
  const pageHref = (n: number): string => {
    const p = new URLSearchParams(query);
    p.set('page', String(n));
    return `/projects?${p.toString()}`;
  };

  // The event the gallery is filtered to, if any: its status and, once published, its results.
  const selected = events.find((e) => e.slug === query.get('event'));

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Gallery</h1>
        {/* Announced when it changes, so a screen reader hears what live search found. */}
        <p className="text-sm text-muted" aria-live="polite">
          {data.total} project{data.total === 1 ? '' : 's'}
          {q ? ` matching “${q}”` : ''}
        </p>
      </div>

      <GalleryFilters
        q={q}
        event={query.get('event') ?? ''}
        events={events.map((e) => ({ slug: e.slug, name: e.name }))}
        track={query.get('track') ?? ''}
        tracks={tracks.map((t) => ({ id: t.id, name: t.name }))}
        tag={tag}
      />

      {selected || tag ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {selected ? (
            <span className="text-muted">
              <span className="font-medium text-fg">{selected.name}</span> ·{' '}
              {selected.submissionsOpen
                ? `accepting submissions until ${formatUtc(selected.submissionsClose)}`
                : 'submissions closed'}
            </span>
          ) : null}
          {tag ? <Badge>{tag}</Badge> : null}
          {/* Only once the organisers publish: results are hidden until then. */}
          {selected?.resultsPublishedAt ? (
            <Link
              href={`/events/${selected.slug}/results`}
              className="font-medium text-accent underline underline-offset-4"
            >
              See the published results →
            </Link>
          ) : null}
          <Link href="/projects" className="text-muted underline underline-offset-4">
            Clear filters
          </Link>
        </div>
      ) : null}

      {data.items.length === 0 ? (
        <EmptyState title="No projects found">
          {q || tag || query.has('event') ? (
            <Link href="/projects" className="underline">
              Clear the search and filters
            </Link>
          ) : (
            'Projects appear here once teams submit them.'
          )}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} eventName={eventNames.get(p.eventId)} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <ButtonLink href={pageHref(page - 1)} variant="secondary">
              ← Previous
            </ButtonLink>
          ) : null}
          <span className="font-mono text-xs text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <ButtonLink href={pageHref(page + 1)} variant="secondary">
              Next →
            </ButtonLink>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
