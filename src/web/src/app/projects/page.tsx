import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectCard } from '@/components/gallery/project-card';
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Input } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';

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

  // The event the gallery is filtered to, if any: its status and, once published, its results.
  const selected = events.find((e) => e.slug === query.get('event'));

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Gallery</h1>
        <p className="text-sm text-muted">
          {data.total} project{data.total === 1 ? '' : 's'}
          {q ? ` matching “${q}”` : ''}
        </p>
      </div>

      <form
        action="/projects"
        method="get"
        role="search"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3"
      >
        <label htmlFor="q" className="sr-only">
          Search projects
        </label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by title, tagline or summary"
          className="min-w-0 flex-1 basis-56"
        />
        <label htmlFor="event" className="sr-only">
          Event
        </label>
        <select id="event" name="event" defaultValue={query.get('event') ?? ''} className={select}>
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
        <Button type="submit">Search</Button>
      </form>

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
