'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useTransition } from 'react';
import { Button, Input } from '@/components/ui';

const select =
  'rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent';

/** How long typing must pause before the gallery searches: one request per pause, not per key. */
const TYPING_PAUSE_MS = 300;

/**
 * The gallery's search and filters. Results follow as you type (after a short pause) and as
 * soon as an event or track is chosen, by updating the page's address, so a filtered gallery
 * can still be linked, bookmarked and reloaded. It is a plain GET form underneath: the Search
 * button, the Enter key and a browser without JavaScript all work the same way.
 */
export function GalleryFilters({
  q,
  event,
  events,
  track,
  tracks,
  tag,
}: {
  q: string;
  event: string;
  events: { slug: string; name: string }[];
  track: string;
  tracks: { id: string; name: string }[];
  tag: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When the address changes without typing (Clear filters, back button), show its search.
  useEffect(() => {
    if (search.current && document.activeElement !== search.current) search.current.value = q;
  }, [q]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /** Applies what the form holds now. A new event starts from all of its tracks. */
  function apply(changed?: 'event') {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!form.current) return;
    const data = new FormData(form.current);
    const params = new URLSearchParams();
    for (const key of ['q', 'event', 'track', 'tag']) {
      if (key === 'track' && changed === 'event') continue;
      const value = String(data.get(key) ?? '').trim();
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    apply();
  }

  return (
    <form
      ref={form}
      action="/projects"
      method="get"
      role="search"
      onSubmit={onSubmit}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3"
    >
      <label htmlFor="q" className="sr-only">
        Search projects
      </label>
      <Input
        ref={search}
        id="q"
        name="q"
        type="search"
        defaultValue={q}
        placeholder="Search by title, tagline or summary"
        autoComplete="off"
        className="min-w-0 flex-1 basis-56"
        onChange={() => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => apply(), TYPING_PAUSE_MS);
        }}
      />
      <label htmlFor="event" className="sr-only">
        Event
      </label>
      {/* Keyed by the address, so Clear filters and the back button reset what it shows. */}
      <select
        key={`event:${event}`}
        id="event"
        name="event"
        defaultValue={event}
        className={select}
        onChange={() => apply('event')}
      >
        <option value="">All events</option>
        {events.map((e) => (
          <option key={e.slug} value={e.slug}>
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
            key={`track:${event}:${track}`}
            id="track"
            name="track"
            defaultValue={track}
            className={select}
            onChange={() => apply()}
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
      <span role="status" className="w-full text-xs text-muted empty:hidden sm:w-auto">
        {pending ? 'Searching…' : ''}
      </span>
    </form>
  );
}
