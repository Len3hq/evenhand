import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmissionForm } from '@/components/participant/submission-form';
import { Badge, Card, ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Submission' };

export default async function SubmissionPage({ params }: PageProps<'/submissions/[ref]'>) {
  const { ref } = await params;
  await requireLogin(`/submissions/${ref}`);

  let submission: Schemas['SubmissionDto'];
  let event: Schemas['EventDetailDto'];
  let mine: Schemas['MyTeamDto'][];
  let questions: Schemas['QuestionsDto'];
  try {
    submission = await apiGet<Schemas['SubmissionDto']>(
      `/api/submissions/${encodeURIComponent(ref)}`,
    );
    [event, mine, questions] = await Promise.all([
      apiGet<Schemas['EventDetailDto']>(`/api/events/${submission.eventId}`),
      apiGet<Schemas['MyTeamDto'][]>('/api/me/teams'),
      apiGet<Schemas['QuestionsDto']>(`/api/events/${submission.eventId}/questions`),
    ]);
  } catch (e) {
    const message =
      e instanceof ApiError && (e.status === 403 || e.status === 404)
        ? 'A submission is visible to its team and the event’s organisers until it is submitted.'
        : e instanceof Error
          ? e.message
          : 'The API is not reachable.';
    return <ErrorState title="This submission is not available" message={message} />;
  }

  const onTeam = mine.some((m) => m.team.id === submission.teamId);
  const open = event.submissionsOpen;
  const submitted = submission.status === 'SUBMITTED';

  return (
    <section className="max-w-3xl space-y-6">
      <div>
        <Link
          href={onTeam ? `/teams/${submission.teamId}` : '/teams'}
          className="text-sm text-muted"
        >
          ← Team
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{submission.title}</h1>
          <Badge tone={submitted ? 'neutral' : 'warning'}>
            {submitted ? 'Submitted' : 'Draft'}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted">
          {event.name} · {open ? 'editable until' : 'closed'} {formatUtc(event.submissionsClose)}
          {submitted ? ` · submitted ${formatUtc(submission.submittedAt)}` : ''}
          {submitted ? (
            <>
              {' · '}
              <Link href={`/projects/${submission.id}`} className="underline">
                View in the gallery
              </Link>
            </>
          ) : null}
        </p>
      </div>

      {submission.eligibility === 'DISQUALIFIED' ? (
        <div role="alert" className="rounded-lg border border-danger p-4 text-sm text-danger">
          <p className="font-medium">Disqualified by the organisers</p>
          <p className="mt-1">
            Reason: {submission.disqualifyReason}. It is out of the gallery, judging and results.
            Ask the organisers if you think this is a mistake.
          </p>
        </div>
      ) : submission.supersededById ? (
        <Card>
          <p className="text-sm">
            This is an older copy. The organisers kept your team&apos;s newer entry,{' '}
            <Link href={`/submissions/${submission.supersededById}`} className="underline">
              which is the one judged
            </Link>
            .
          </p>
        </Card>
      ) : submission.duplicateHold ? (
        <Card>
          <p className="text-sm">
            Your team has two entries. This older copy is on hold until the organisers confirm which
            one is judged (normally the newer one).
          </p>
        </Card>
      ) : null}

      {!open ? (
        <Card>
          <p className="text-sm">
            Submissions for this event are closed. This is the version the judges see.
          </p>
        </Card>
      ) : !onTeam ? (
        <Card>
          <p className="text-sm">You can read this submission, but only its team can change it.</p>
        </Card>
      ) : submitted ? (
        <Card>
          <p className="text-sm">
            Submitted and public. You can still improve it until the deadline; it stays submitted.
          </p>
        </Card>
      ) : null}

      <SubmissionForm
        submission={submission}
        tracks={event.tracks}
        questions={questions.questions}
        readOnly={!open || !onTeam}
      />
    </section>
  );
}
