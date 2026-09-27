import type { Metadata } from 'next';
import Link from 'next/link';
import { InvitePanel } from '@/components/participant/invite-panel';
import { StartSubmission } from '@/components/participant/start-submission';
import { Badge, Card, ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage({ params }: PageProps<'/teams/[ref]'>) {
  const { ref } = await params;
  const me = await requireLogin(`/teams/${ref}`);

  let team: Schemas['TeamDto'];
  let event: Schemas['EventDto'];
  try {
    team = await apiGet<Schemas['TeamDto']>(`/api/teams/${encodeURIComponent(ref)}`);
    event = await apiGet<Schemas['EventDto']>(`/api/events/${team.eventId}`);
  } catch (e) {
    const message =
      e instanceof ApiError && (e.status === 403 || e.status === 404)
        ? 'You can see a team only if you are on it or organise its event.'
        : e instanceof Error
          ? e.message
          : 'The API is not reachable.';
    return <ErrorState title="This team is not available" message={message} />;
  }

  const isMember = team.members.some((m) => m.userId === me.id);
  const open = event.submissionsOpen;

  return (
    <section className="space-y-8">
      <div>
        <Link href="/teams" className="text-sm text-muted">
          ← My teams
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{team.name}</h1>
          <Badge tone={open ? 'neutral' : 'warning'}>
            {open ? 'Accepting submissions' : 'Submissions closed'}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          {event.name} · {open ? 'closes' : 'closed'} {formatUtc(event.submissionsClose)}
        </p>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Members</h2>
        <ul className="space-y-1 text-sm">
          {team.members.map((m) => (
            <li key={m.userId}>
              {m.name} <span className="text-muted">· {m.email}</span>
              {m.userId === me.id ? <span className="text-muted"> (you)</span> : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Project</h2>
        {team.submissionId ? (
          <p className="text-sm">
            <Link href={`/submissions/${team.submissionId}`} className="underline">
              Open the team&apos;s submission
            </Link>
          </p>
        ) : isMember && open ? (
          <StartSubmission eventSlug={event.slug} />
        ) : (
          <p className="text-sm text-muted">No submission.</p>
        )}
      </Card>

      {isMember ? (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Invite teammates</h2>
          {open ? (
            <>
              <p className="mb-3 text-sm text-muted">
                Nothing is emailed: send the link yourself. Anyone with it can join until it expires
                or is used up.
              </p>
              <InvitePanel teamId={team.id} />
            </>
          ) : (
            <p className="text-sm text-muted">
              Teams are fixed once submissions close; no one can join now.
            </p>
          )}
        </Card>
      ) : null}
    </section>
  );
}
