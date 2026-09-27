import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, EmptyState } from '@/components/ui';
import { formatUtc } from '@/lib/dates';
import { managedEvents } from '@/lib/organizer';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Organise' };

export default async function OrganizerHome() {
  const me = await requireLogin('/organizer');
  const events = await managedEvents(me);
  const mayCreate = me.isAdmin || me.roles.some((r) => r.role === 'ORGANIZER');

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Your events</h1>
          <p className="text-sm text-muted">
            {me.isAdmin ? 'As an admin you can manage every event.' : 'Events you organise.'}
          </p>
        </div>
        {mayCreate ? (
          <Link
            href="/organizer/events/new"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          >
            New event
          </Link>
        ) : null}
      </div>

      <div className="mt-6">
        {events.length === 0 ? (
          <EmptyState title="You do not organise any events">
            An admin creates the first event, or makes you an organiser of one.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {events.map((e) => (
              <li key={e.id}>
                <Card>
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/organizer/events/${e.slug}`} className="font-medium underline">
                      {e.name}
                    </Link>
                    <Badge tone={e.submissionsOpen ? 'neutral' : 'warning'}>
                      {e.submissionsOpen ? 'Open' : 'Closed'}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    Submissions close {formatUtc(e.submissionsClose)}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
