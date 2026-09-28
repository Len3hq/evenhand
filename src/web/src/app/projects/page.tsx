import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectCard } from '@/components/gallery/project-card';
import { Button, EmptyState, ErrorState, Input } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';

// Always render at request time: the gallery changes as teams submit, and `next build`
// must not need the API.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Gallery' };

const select =
  'rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent';

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

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Gallery</h1>
          <p className="text-sm text-muted">
            {data.total} project{data.total === 1 ? '' : 's'}
            {q ? ` matching “${q}”` : ''}
          </p>
        </div>
        <form action="/projects" method="get" role="search" className="flex flex-wrap gap-2">
          <label htmlFor="q" className="sr-only">
            Search projects
          </label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search projects"
            className="w-56"
          />
          <label htmlFor="event" className="sr-only">
            Event
          </label>
          <select
            id="event"
            name="event"
            defaultValue={query.get('event') ?? ''}
            className={select}
          >
            <option value="">All events</option>
            {events.map((e) => (
              <option key={e.id} value={e.slug}>
                {e.name}
              </option>
            ))}
          </select>
          {tracks.length ? (
            <>
              <label htmlFor="track" className="sr-only">
                Track
              </label>
              <select
                id="track"
                name="track"
                defaultValue={query.get('track') ?? ''}
                className={select}
              >
                <option value="">All tracks</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {tag ? <input type="hidden" name="tag" value={tag} /> : null}
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>
      {tag || query.has('event') ? (
        <p className="mt-2 text-sm text-muted">
          {tag ? <>Tag: {tag} · </> : null}
          <Link href="/projects" className="underline">
            Clear filters
          </Link>
        </p>
      ) : null}

      {data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No projects found">
            {q || tag || query.has('event') ? (
              <Link href="/projects" className="underline">
                Clear the search and filters
              </Link>
            ) : (
              'Projects appear here once teams submit them.'
            )}
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} eventName={eventNames.get(p.eventId)} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex items-center gap-4 text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)}>← Previous</Link> : null}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={pageHref(page + 1)}>Next →</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
