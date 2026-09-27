import type { Metadata } from 'next';
import Link from 'next/link';
import { EventForm } from '@/components/organizer/event-form';
import { ErrorState } from '@/components/ui';
import { requireLogin } from '@/lib/organizer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New event' };

export default async function NewEventPage() {
  const me = await requireLogin('/organizer/events/new');
  const mayCreate = me.isAdmin || me.roles.some((r) => r.role === 'ORGANIZER');

  return (
    <section className="max-w-2xl">
      <Link href="/organizer" className="text-sm text-muted">
        ← Your events
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">New event</h1>
      <p className="mt-1 text-sm text-muted">
        You become its organiser. Tracks and prizes are added on the next page.
      </p>
      <div className="mt-6">
        {mayCreate ? (
          <EventForm />
        ) : (
          <ErrorState
            title="You cannot create events"
            message="Admins and people who already organise an event can create one."
          />
        )}
      </div>
    </section>
  );
}
