'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, ErrorState } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';

type Duplicate = Schemas['DuplicateDto'];
type Entry = Schemas['EntryDto'];

const REASONS: Record<Duplicate['reason'], string> = {
  SAME_TEAM: 'Same team submitted twice',
  SAME_REPO: 'Same repository, different teams',
  SAME_TITLE: 'Same title, different teams',
};

const list = (names: string[]): string => (names.length ? names.join(', ') : 'none');

/**
 * Suspected duplicates side by side, with exactly what confirming does to each judge's review.
 * The API decides what is allowed; this panel only shows it and asks before acting.
 */
export function DuplicatesPanel({ duplicates }: { duplicates: Duplicate[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: 'confirm' | 'dismiss' | 'reopen', question: string) {
    if (!window.confirm(question)) return;
    setBusy(id);
    setError(null);
    try {
      await apiPost(`/api/duplicates/${id}/${action}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  if (!duplicates.length) {
    return (
      <EmptyState title="No suspected duplicates">Nothing was flagged for this event.</EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorState title="Not done" message={error} /> : null}
      {duplicates.map((d) => (
        // An article named by its heading, so each decision is one landmark for screen readers.
        <article key={d.id} aria-labelledby={`duplicate-${d.id}`}>
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id={`duplicate-${d.id}`} className="font-semibold">
                {d.kept.title}
              </h3>
              <Badge>{REASONS[d.reason]}</Badge>
              <Badge tone={d.status === 'PENDING' ? 'warning' : 'neutral'}>
                {d.status === 'PENDING'
                  ? 'Waiting for your decision'
                  : d.status === 'CONFIRMED'
                    ? 'Confirmed'
                    : 'Dismissed'}
              </Badge>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Side heading="Older copy" entry={d.superseded} />
              <Side heading="Newer copy (kept if confirmed)" entry={d.kept} />
            </div>

            {d.status !== 'DISMISSED' ? (
              <div className="mt-3 text-sm">
                <p className="font-medium">
                  {d.status === 'PENDING' ? 'If you confirm:' : 'What confirming did:'}
                </p>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  <li>
                    The older copy leaves the gallery and judging. Reviews that move to the newer
                    copy (the judge reviewed only the older one): {list(d.merge.moved)}.
                  </li>
                  <li>
                    Reviews set aside so nobody counts twice (the judge reviewed both):{' '}
                    {list(d.merge.setAside)}.
                  </li>
                </ul>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              {d.status === 'PENDING' ? (
                <>
                  <Button
                    type="button"
                    disabled={busy !== null || d.blockedBy !== null}
                    onClick={() =>
                      act(
                        d.id,
                        'confirm',
                        `Keep “${d.kept.title}” and replace the older copy? Its reviews move as listed.`,
                      )
                    }
                  >
                    Confirm: keep the newer copy
                  </Button>
                  {d.reason !== 'SAME_TEAM' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy !== null}
                      onClick={() =>
                        act(d.id, 'dismiss', 'These are different projects: keep both in judging?')
                      }
                    >
                      Not a duplicate
                    </Button>
                  ) : (
                    <span className="text-sm text-muted">
                      One team&apos;s two entries cannot both stay: a team has one live entry.
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm text-muted">
                    {d.status === 'CONFIRMED' ? 'Confirmed' : 'Dismissed'} by{' '}
                    {d.decidedBy ?? 'someone'} {formatUtc(d.decidedAt)}.
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() =>
                      act(d.id, 'reopen', 'Undo this decision? Everything goes back as it was.')
                    }
                  >
                    Undo
                  </Button>
                </>
              )}
            </div>
            {d.blockedBy ? <p className="mt-2 text-sm text-warning">{d.blockedBy}</p> : null}
          </Card>
        </article>
      ))}
    </div>
  );
}

function Side({ heading, entry }: { heading: string; entry: Entry }) {
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <p className="text-xs uppercase tracking-wide text-muted">{heading}</p>
      <p className="mt-1 font-medium">
        {entry.title}{' '}
        {entry.externalId ? <span className="text-muted">({entry.externalId})</span> : null}
      </p>
      <p className="text-muted">
        {entry.teamName} · submitted {formatUtc(entry.submittedAt)}
      </p>
      <p className="text-muted">
        {entry.finalReviews} counted review{entry.finalReviews === 1 ? '' : 's'}
        {entry.repoUrl ? ` · ${entry.repoUrl}` : ''}
      </p>
    </div>
  );
}
