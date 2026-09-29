import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { AssignmentPanel } from '@/components/organizer/assignment-panel';
import { EventForm } from '@/components/organizer/event-form';
import { JudgesEditor } from '@/components/organizer/judges-editor';
import { OrganizersEditor } from '@/components/organizer/organizers-editor';
import { formatUtc } from '@/lib/dates';
import { PrizesEditor } from '@/components/organizer/prizes-editor';
import { QuestionsEditor } from '@/components/organizer/questions-editor';
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

  const [organizers, rubric, questions, judges] = await Promise.all([
    apiGet<Schemas['OrganizerDto'][]>(`/api/events/${event.id}/organizers`),
    apiGet<Schemas['RubricDto']>(`/api/events/${event.id}/criteria`),
    apiGet<Schemas['QuestionsDto']>(`/api/events/${event.id}/questions`),
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

  const base = `/organizer/events/${event.slug}`;
  // The event's other pages. Their descriptions avoid the word "results" so that "Results" is
  // only ever the link below.
  const pages = [
    [`${base}/progress`, 'Judging progress', 'Who has finished, and judges to look at'],
    [`${base}/entries`, 'Entries and duplicates', 'Suspected duplicates and disqualifying'],
    [`${base}/results`, 'Results', 'Rank, read the receipt, publish'],
    [`${base}/audit`, 'Audit trail', 'Everything that changed, as sentences'],
    [`${base}/voting`, 'Community vote', 'A people’s choice, apart from judging'],
  ] as const;
  const sections = [
    ['details', 'Name and dates'],
    ['tracks', 'Tracks'],
    ['prizes', 'Prizes'],
    ['questions', 'Questions'],
    ['rubric', 'Rubric'],
    ['judges', 'Judges'],
    ['assignment', 'Assignment'],
    ['organisers', 'Organisers'],
    ['downloads', 'Downloads'],
  ] as const;

  return (
    <section className="space-y-8">
      <div className="space-y-2">
        <Link href="/organizer" className="text-sm text-muted hover:text-fg">
          ← Your events
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
          <Badge tone={event.submissionsOpen ? 'success' : 'warning'}>
            {event.submissionsOpen ? 'Accepting submissions' : 'Submissions closed'}
          </Badge>
        </div>
        <p className="font-mono text-xs text-muted">
          /{event.slug} · closes {formatUtc(event.submissionsClose)}
        </p>
      </div>

      <nav aria-label="Event pages">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {pages.map(([href, label, hint]) => (
            <li key={href}>
              <Link
                href={href}
                className="block h-full rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent"
              >
                <span className="block font-semibold">{label}</span>
                <span className="mt-1 block text-sm text-muted">{hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[11rem_1fr]">
        <nav aria-label="Settings on this page" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 text-sm">
            <li className="pb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
              Settings
            </li>
            {sections.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block rounded-md px-2 py-1 text-muted hover:bg-surface hover:text-fg"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          <Section id="details" title="Name and dates">
            <EventForm event={event} />
          </Section>

          <Section id="tracks" title="Tracks">
            <TracksEditor eventId={event.id} tracks={event.tracks} />
          </Section>

          <Section id="prizes" title="Prizes">
            <PrizesEditor eventId={event.id} prizes={event.prizes} tracks={event.tracks} />
          </Section>

          <Section
            id="questions"
            title="Submission questions"
            intro="Asked of every team beside the standard fields. Answers are seen by the team, organisers and judges; tick “public” to show them in the gallery too. Drafts may leave required questions empty; submitting may not."
          >
            <QuestionsEditor eventId={event.id} questions={questions.questions} />
          </Section>

          <Section
            id="rubric"
            title="Judging rubric"
            intro="A project’s score is each criterion’s mark times its share, added up. Teams can see this rubric."
          >
            <RubricEditor eventId={event.id} rubric={rubric} />
          </Section>

          <Section
            id="judges"
            title="Judges"
            intro="Judges see and score only their tracks, and never each other’s scores. Nobody on a team in this event, or organising it, can judge it."
          >
            <JudgesEditor eventId={event.id} judges={judges} tracks={event.tracks} />
          </Section>

          <Section
            id="assignment"
            title="Assignment"
            intro="Gives each submitted project the chosen number of judges from its track: least-busy judge first, never a conflict of interest, random where it is a tie. Run it after submissions close, and again after inviting more judges."
          >
            <AssignmentPanel eventId={event.id} />
          </Section>

          <Section id="organisers" title="Organisers">
            <OrganizersEditor eventId={event.id} organizers={organizers} myId={me.id} />
          </Section>

          <Section id="downloads" title="Downloads">
            <ul className="flex flex-wrap gap-2 text-sm">
              {downloads.map((d) => (
                <li key={d.href}>
                  {/* Plain links: the files come from the API, with the session cookie. */}
                  <a
                    href={d.href}
                    className="inline-block rounded-full border border-border px-3 py-1.5 hover:border-accent"
                    download
                  >
                    {d.label}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </section>
  );
}

/** One settings section: a card with an anchor the "on this page" list links to. */
function Section({
  id,
  title,
  intro,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <Card>
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
        {intro ? <p className="mt-1 max-w-3xl text-sm text-muted">{intro}</p> : null}
        <div className="mt-4">{children}</div>
      </Card>
    </section>
  );
}
