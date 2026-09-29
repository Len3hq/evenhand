import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, ButtonLink, Card, EmptyState } from '@/components/ui';
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
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Your events</h1>
          <p className="text-sm text-muted">
            {me.isAdmin ? 'As an admin you can manage every event.' : 'Events you organise.'}
          </p>
        </div>
        {mayCreate ? <ButtonLink href="/organizer/events/new">New event</ButtonLink> : null}
      </div>

      <div>
        {events.length === 0 ? (
          <EmptyState title="You do not organise any events">
            An admin creates the first event, or makes you an organiser of one.
          </EmptyState>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {events.map((e) => (
              <li key={e.id}>
                <Card className="relative h-full transition-shadow hover:shadow-md has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-accent">
                  <div className="flex items-start justify-between gap-2">
                    {/* The link covers the whole card, so the card is one target. */}
                    <Link
                      href={`/organizer/events/${e.slug}`}
                      className="font-semibold after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:outline-none"
                    >
                      {e.name}
                    </Link>
                    <Badge tone={e.submissionsOpen ? 'success' : 'warning'}>
                      {e.submissionsOpen ? 'Open' : 'Closed'}
                    </Badge>
                  </div>
                  <p className="mt-2 font-mono text-xs text-muted">
                    Submissions close {formatUtc(e.submissionsClose)}
                  </p>
                  {e.resultsPublishedAt ? (
                    <p className="mt-1 font-mono text-xs text-muted">Results published</p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
