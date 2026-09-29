import type { Metadata } from 'next';
import { AuditList } from '@/components/audit/audit-list';
import { Button, ErrorState, Input, Label } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { requireLogin } from '@/lib/session';
import { ChainStatus } from '@/components/audit/chain-status';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Platform audit trail' };

const PAGE_SIZE = 50;
const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v)?.trim() ?? '';

/** What happens outside any event, grouped so an admin does not need to know action names. */
const GROUPS = [
  ['', 'Everything'],
  ['auth.login_failed', 'Failed logins'],
  ['auth.', 'Logins, logouts and new accounts'],
  ['user.', 'Admin grants and password resets'],
  ['token.', 'API tokens'],
  ['request.', 'Refused requests (rate limits)'],
] as const;

/**
 * The platform trail for admins: logins, failed logins, accounts, admin grants, API tokens and
 * rate-limit refusals, with the address each came from. The API decides who may read it (admins
 * only); this page shows its answer, so anyone else sees the refusal.
 */
export default async function PlatformAuditPage({ searchParams }: PageProps<'/admin/audit'>) {
  const sp = await searchParams;
  const action = first(sp.action);
  const actor = first(sp.actor);
  const page = Math.max(1, Number(first(sp.page)) || 1);
  await requireLogin('/admin/audit');

  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  if (action) query.set('action', action);
  if (actor) query.set('actor', actor);

  let trail: Schemas['PlatformAuditPageDto'];
  try {
    trail = await apiGet<Schemas['PlatformAuditPageDto']>(`/api/audit?${query.toString()}`);
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 403
        ? 'Only platform admins can read the platform audit trail.'
        : e instanceof ApiError
          ? e.message
          : 'The API is not reachable.';
    return <ErrorState title="The platform audit trail is not available" message={message} />;
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
      <h1 className="text-2xl font-semibold">Platform audit trail</h1>
      <p className="max-w-3xl text-sm text-muted">
        What happened outside any event, newest first: logins and failed logins, new accounts, admin
        grants, password resets, API tokens and requests refused by a rate limit, with the address
        each came from. Entries cannot be edited or deleted. Each event&apos;s own trail is on its
        organiser page.
      </p>
      <ChainStatus />

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
      <p className="mt-2 text-xs text-muted">
        {trail.total} entr{trail.total === 1 ? 'y' : 'ies'}. A failed login has no person behind it
        yet: find it under “Failed logins”, which names the email that was tried.
      </p>

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
