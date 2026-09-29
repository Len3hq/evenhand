import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, ButtonLink, Card, EmptyState } from '@/components/ui';
import { apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Judging' };

const STATE = {
  NOT_STARTED: { label: 'Not started', tone: 'warning' },
  DRAFT: { label: 'Draft', tone: 'warning' },
  FINAL: { label: 'Submitted', tone: 'success' },
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
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Judging</h1>
        <p className="max-w-2xl text-muted">
          Your projects, in order. Drafts save as you go; a submitted review is final. You never see
          another judge&apos;s scores.
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
                <div className="space-y-0.5">
                  <h2 className="text-lg font-semibold">{e.eventName}</h2>
                  <p className="text-sm text-muted">
                    {e.finished} of {e.assigned} submitted ·{' '}
                    {e.judgingClose
                      ? `${e.judgingOpen ? 'judging closes' : 'judging closed'} ${formatUtc(e.judgingClose)}`
                      : 'no judging deadline'}
                  </p>
                </div>
                {next && e.judgingOpen ? (
                  <ButtonLink href={`/judging/${next.assignmentId}`}>
                    {next.state === 'NOT_STARTED' && e.finished === 0 ? 'Start' : 'Continue'}
                  </ButtonLink>
                ) : null}
              </div>
              <div
                className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg"
                role="progressbar"
                aria-label={`${e.eventName}: ${e.finished} of ${e.assigned} submitted`}
                aria-valuemin={0}
                aria-valuemax={e.assigned}
                aria-valuenow={e.finished}
              >
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <ol className="-mx-2 mt-4 text-sm">
                {e.items.map((i) => (
                  <li key={i.assignmentId}>
                    <Link
                      href={`/judging/${i.assignmentId}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-bg"
                    >
                      <span className="min-w-0 truncate">
                        <span className="mr-3 font-mono text-xs text-muted">
                          {String(i.position + 1).padStart(2, '0')}
                        </span>
                        {i.title}
                      </span>
                      <Badge tone={STATE[i.state].tone}>{STATE[i.state].label}</Badge>
                    </Link>
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
