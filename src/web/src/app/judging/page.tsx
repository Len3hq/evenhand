import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, EmptyState } from '@/components/ui';
import { apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Judging' };

const STATE = {
  NOT_STARTED: { label: 'Not started', tone: 'warning' },
  DRAFT: { label: 'Draft', tone: 'warning' },
  FINAL: { label: 'Submitted', tone: 'neutral' },
} as const;

/** Your judging queue in every event you judge. */
export default async function JudgingPage() {
  const me = await requireLogin('/judging');
  const judges = me.isAdmin || me.roles.some((r) => r.role === 'JUDGE');
  const queue = judges
    ? await apiGet<Schemas['JudgeQueueDto']>('/api/judge/queue')
    : { events: [] as Schemas['QueueEventDto'][] };
  const judgedIds = new Set(me.roles.filter((r) => r.role === 'JUDGE').map((r) => r.eventId));
  const waiting = judgedIds.size - queue.events.length;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Judging</h1>
        <p className="text-sm text-muted">
          You see and score only the projects assigned to you, and never another judge&apos;s
          scores. Drafts save as you go; a submitted review is final.
        </p>
      </div>

      {queue.events.length === 0 ? (
        <EmptyState
          title={judgedIds.size ? 'Nothing assigned to you yet' : 'You do not judge any events'}
        >
          {judgedIds.size
            ? 'Projects appear here once the organisers run assignment.'
            : 'Organisers invite judges with a link.'}
        </EmptyState>
      ) : (
        queue.events.map((e) => {
          const next = e.items.find((i) => i.state !== 'FINAL');
          const pct = e.assigned ? Math.round((e.finished / e.assigned) * 100) : 0;
          return (
            <Card key={e.eventId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{e.eventName}</h2>
                  <p className="text-sm text-muted">
                    {e.finished} of {e.assigned} submitted ·{' '}
                    {e.judgingClose
                      ? `${e.judgingOpen ? 'judging closes' : 'judging closed'} ${formatUtc(e.judgingClose)}`
                      : 'no judging deadline'}
                  </p>
                </div>
                {next && e.judgingOpen ? (
                  <Link
                    href={`/judging/${next.assignmentId}`}
                    className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
                  >
                    {next.state === 'NOT_STARTED' && e.finished === 0 ? 'Start' : 'Continue'}
                  </Link>
                ) : null}
              </div>
              <div
                className="mt-3 h-2 overflow-hidden rounded bg-bg"
                role="progressbar"
                aria-label={`${e.eventName}: ${e.finished} of ${e.assigned} submitted`}
                aria-valuemin={0}
                aria-valuemax={e.assigned}
                aria-valuenow={e.finished}
              >
                <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <ol className="mt-4 space-y-1 text-sm">
                {e.items.map((i) => (
                  <li key={i.assignmentId} className="flex items-center justify-between gap-2">
                    <Link href={`/judging/${i.assignmentId}`} className="underline">
                      {i.position + 1}. {i.title}
                    </Link>
                    <Badge tone={STATE[i.state].tone}>{STATE[i.state].label}</Badge>
                  </li>
                ))}
              </ol>
            </Card>
          );
        })
      )}
      {waiting > 0 && queue.events.length > 0 ? (
        <p className="text-sm text-muted">
          {waiting} more event{waiting === 1 ? '' : 's'} you judge {waiting === 1 ? 'has' : 'have'}{' '}
          nothing assigned to you yet.
        </p>
      ) : null}
    </section>
  );
}
