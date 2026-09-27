import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateTeamForm } from '@/components/participant/create-team-form';
import { Badge, Card, EmptyState } from '@/components/ui';
import { apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My teams' };

export default async function MyTeamsPage() {
  const me = await requireLogin('/teams');
  const [mine, events] = await Promise.all([
    apiGet<Schemas['MyTeamDto'][]>('/api/me/teams'),
    apiGet<Schemas['EventPageDto']>('/api/events?pageSize=100'),
  ]);

  // Open events where you could start a team: not one you are already on a team in, and not
  // one you judge or organise (the API refuses those: a conflict of interest).
  const busy = new Set([
    ...mine.map((m) => m.event.id),
    ...me.roles.filter((r) => r.role !== 'PARTICIPANT').map((r) => r.eventId),
  ]);
  const joinable = events.items.filter((e) => e.submissionsOpen && !busy.has(e.id));

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">My teams</h1>
        <p className="text-sm text-muted">
          One team per event. To join someone else&apos;s team, open the invite link they send you.
        </p>
      </div>

      {mine.length === 0 ? (
        <EmptyState title="You are not on a team yet">
          Start one below, or open an invite link from a teammate.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {mine.map(({ team, event, submission }) => (
            <li key={team.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/teams/${team.id}`} className="font-medium underline">
                    {team.name}
                  </Link>
                  <Badge tone={event.submissionsOpen ? 'neutral' : 'warning'}>
                    {event.submissionsOpen ? 'Open' : 'Closed'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {event.name} · closes {formatUtc(event.submissionsClose)}
                </p>
                <p className="mt-2 text-sm">
                  {team.members.length} member{team.members.length === 1 ? '' : 's'} ·{' '}
                  {submission
                    ? `“${submission.title}” (${submission.status === 'SUBMITTED' ? 'submitted' : 'draft'})`
                    : 'no submission yet'}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Start a team</h2>
        {joinable.length === 0 ? (
          <p className="text-sm text-muted">
            There is no open event you can start a team in right now.
          </p>
        ) : (
          <CreateTeamForm events={joinable} />
        )}
      </Card>
    </section>
  );
}
