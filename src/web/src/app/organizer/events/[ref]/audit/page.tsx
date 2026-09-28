import type { Metadata } from 'next';
import Link from 'next/link';
import { AuditList } from '@/components/audit/audit-list';
import { Button, ErrorState, Input, Label } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Audit trail' };

const PAGE_SIZE = 50;
const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? '';

/** Common filters, so an organiser does not need to know action names. */
const GROUPS = [
  ['', 'Everything'],
  ['event.', 'Event settings'],
  ['track.', 'Tracks'],
  ['prize.', 'Prizes'],
  ['team.', 'Teams'],
  ['invite.', 'Invite links'],
  ['submission.', 'Submissions'],
] as const;

export default async function AuditPage({
  params,
  searchParams,
}: PageProps<'/organizer/events/[ref]/audit'>) {
  const { ref } = await params;
  const sp = await searchParams;
  const action = first(sp.action);
  const actor = first(sp.actor);
  const page = Math.max(1, Number(first(sp.page)) || 1);
  await requireLogin(`/organizer/events/${ref}/audit`);

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (action) query.set('action', action);
  if (actor) query.set('actor', actor);

  let event: Schemas['EventDto'];
  let trail: Schemas['AuditPageDto'];
  try {
    event = await apiGet<Schemas['EventDto']>(`/api/events/${encodeURIComponent(ref)}`);
    trail = await apiGet<Schemas['AuditPageDto']>(
      `/api/events/${encodeURIComponent(ref)}/audit?${query.toString()}`,
    );
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 403
        ? 'Only the event’s organisers and admins can read its audit trail.'
        : e instanceof ApiError && e.status === 404
          ? 'There is no such event.'
          : e instanceof ApiError
            ? e.message
            : 'The API is not reachable.';
    return <ErrorState title="The audit trail could not be loaded" message={message} />;
  }

  const pages = Math.max(1, Math.ceil(trail.total / trail.pageSize));
  const pageHref = (n: number) => {
    const p = new URLSearchParams(query);
    p.delete('pageSize');
    p.set('page', String(n));
    return `?${p.toString()}`;
  };

  return (
    <section>
      <Link href={`/organizer/events/${event.slug}`} className="text-sm text-muted">
        ← {event.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Audit trail</h1>
          <p className="text-sm text-muted">
            Everything that changed in this event, newest first. Entries cannot be edited or
            deleted.
          </p>
        </div>
        <a
          href={`/api/events/${event.slug}/export/audit.csv`}
          className="text-sm underline"
          download
        >
          Download CSV
        </a>
      </div>

      <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="action" className="mb-1 block text-sm font-medium">
            Show
          </label>
          <select
            id="action"
            name="action"
            defaultValue={action}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          >
            {GROUPS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-64 flex-1">
          <Label htmlFor="actor">By (email)</Label>
          <Input id="actor" name="actor" type="email" defaultValue={actor} />
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <AuditList
        items={trail.items}
        page={page}
        pages={pages}
        pageHref={pageHref}
        emptyHint="Try “Everything”, or clear the email."
      />
    </section>
  );
}
