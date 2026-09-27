import type { Metadata } from 'next';
import { Card, EmptyState } from '@/components/ui';
import { apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Judging' };

/** The events you judge. Your review queue for each appears here once projects are assigned. */
export default async function JudgingPage() {
  const me = await requireLogin('/judging');
  const judged = new Set(me.roles.filter((r) => r.role === 'JUDGE').map((r) => r.eventId));
  const events = (await apiGet<Schemas['EventPageDto']>('/api/events?pageSize=100')).items.filter(
    (e) => judged.has(e.id),
  );

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Judging</h1>
        <p className="text-sm text-muted">
          You see and score only the projects assigned to you, and never another judge&apos;s
          scores.
        </p>
      </div>
      {events.length === 0 ? (
        <EmptyState title="You do not judge any events">
          Organisers invite judges with a link.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {events.map((e) => (
            <li key={e.id}>
              <Card>
                <p className="font-medium">{e.name}</p>
                <p className="mt-1 text-sm text-muted">
                  {e.judgingClose
                    ? `Judging closes ${formatUtc(e.judgingClose)}`
                    : 'No judging deadline set'}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
