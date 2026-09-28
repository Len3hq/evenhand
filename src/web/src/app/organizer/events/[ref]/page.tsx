import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AssignmentPanel } from '@/components/organizer/assignment-panel';
import { EventForm } from '@/components/organizer/event-form';
import { JudgesEditor } from '@/components/organizer/judges-editor';
import { OrganizersEditor } from '@/components/organizer/organizers-editor';
import { formatUtc } from '@/lib/dates';
import { PrizesEditor } from '@/components/organizer/prizes-editor';
import { RubricEditor } from '@/components/organizer/rubric-editor';
import { TracksEditor } from '@/components/organizer/tracks-editor';
import { Badge, Card, ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { canManage } from '@/lib/organizer';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Event settings' };

export default async function EventSettingsPage({ params }: PageProps<'/organizer/events/[ref]'>) {
  const { ref } = await params;
  const me = await requireLogin(`/organizer/events/${ref}`);

  let event: Schemas['EventDetailDto'] | null = null;
  try {
    event = await apiGet<Schemas['EventDetailDto']>(`/api/events/${encodeURIComponent(ref)}`);
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  }
  if (!event) notFound();

  if (!canManage(me, event.id)) {
    return (
      <ErrorState
        title="You do not organise this event"
        message="Only its organisers and admins can change it."
      />
    );
  }

  const [organizers, rubric, judges] = await Promise.all([
    apiGet<Schemas['OrganizerDto'][]>(`/api/events/${event.id}/organizers`),
    apiGet<Schemas['RubricDto']>(`/api/events/${event.id}/criteria`),
    apiGet<Schemas['JudgeDto'][]>(`/api/events/${event.id}/judges`),
  ]);

  const downloads = [
    {
      href: `/api/events/${event.slug}/export.json`,
      label: 'Whole event (JSON, fixtures.json shape)',
    },
    { href: `/api/events/${event.slug}/export/teams.csv`, label: 'Teams and members (CSV)' },
    { href: `/api/events/${event.slug}/export/submissions.csv`, label: 'Submissions (CSV)' },
    { href: `/api/events/${event.slug}/export/assignments.csv`, label: 'Assignments (CSV)' },
    { href: `/api/events/${event.slug}/export/scores.csv`, label: 'Scores (CSV)' },
    { href: `/api/events/${event.slug}/export/results.csv`, label: 'Results (CSV)' },
    { href: `/api/events/${event.slug}/export/audit.csv`, label: 'Audit trail (CSV)' },
  ];

  return (
    <section className="space-y-8">
      <div>
        <Link href="/organizer" className="text-sm text-muted">
          ← Your events
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{event.name}</h1>
          <Badge tone={event.submissionsOpen ? 'neutral' : 'warning'}>
            {event.submissionsOpen ? 'Accepting submissions' : 'Submissions closed'}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          /{event.slug} · closes {formatUtc(event.submissionsClose)} ·{' '}
          <Link href={`/organizer/events/${event.slug}/progress`} className="underline">
            Judging progress
          </Link>{' '}
          ·{' '}
          <Link href={`/organizer/events/${event.slug}/entries`} className="underline">
            Entries and duplicates
          </Link>{' '}
          ·{' '}
          <Link href={`/organizer/events/${event.slug}/results`} className="underline">
            Results
          </Link>{' '}
          ·{' '}
          <Link href={`/organizer/events/${event.slug}/audit`} className="underline">
            Audit trail
          </Link>
        </p>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Name and dates</h2>
        <EventForm event={event} />
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Tracks</h2>
        <TracksEditor eventId={event.id} tracks={event.tracks} />
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Prizes</h2>
        <PrizesEditor eventId={event.id} prizes={event.prizes} tracks={event.tracks} />
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Judging rubric</h2>
        <p className="mb-4 text-sm text-muted">
          A project&apos;s score is each criterion&apos;s mark times its share, added up. Teams can
          see this rubric.
        </p>
        <RubricEditor eventId={event.id} rubric={rubric} />
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Judges</h2>
        <p className="mb-4 text-sm text-muted">
          Judges see and score only their tracks, and never each other&apos;s scores. Nobody on a
          team in this event, or organising it, can judge it.
        </p>
        <JudgesEditor eventId={event.id} judges={judges} tracks={event.tracks} />
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold">Assignment</h2>
        <p className="mb-4 text-sm text-muted">
          Gives each submitted project the chosen number of judges from its track: least-busy judge
          first, never a conflict of interest, random where it is a tie. Run it after submissions
          close; run it again after inviting more judges.
        </p>
        <AssignmentPanel eventId={event.id} />
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Organisers</h2>
        <OrganizersEditor eventId={event.id} organizers={organizers} myId={me.id} />
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Downloads</h2>
        <ul className="space-y-1 text-sm">
          {downloads.map((d) => (
            <li key={d.href}>
              {/* Plain links: the files come from the API, with the session cookie. */}
              <a href={d.href} className="underline" download>
                {d.label}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
