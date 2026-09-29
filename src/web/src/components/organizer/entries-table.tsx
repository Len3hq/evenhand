'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Badge, Button, EmptyState, ErrorState, Input } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

type Entry = Schemas['EntryDto'];

const STATE: Record<Entry['state'], string> = {
  IN_JUDGING: 'In judging',
  HELD: 'Held: suspected duplicate',
  REPLACED: 'Replaced by a newer copy',
  DISQUALIFIED: 'Disqualified',
};

/**
 * Every submitted entry and where it stands. Disqualifying takes an entry out of the gallery,
 * judging and rankings at once, with a reason the team sees; reinstating brings it back.
 */
export function EntriesTable({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOpen(null);
      setReason('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function disqualify(e: FormEvent, id: string) {
    e.preventDefault();
    void send(() => apiPost(`/api/submissions/${id}/disqualify`, { reason }));
  }

  if (!entries.length) {
    return <EmptyState title="No submitted entries yet" />;
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorState title="Not done" message={error} /> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-medium">Project</th>
              <th className="font-medium">Track</th>
              <th className="font-medium">Reviews</th>
              <th className="font-medium">Standing</th>
              <th className="font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-border align-top">
                <td className="py-2">
                  {e.state === 'IN_JUDGING' ? (
                    <Link href={`/projects/${e.id}`} className="underline">
                      {e.title}
                    </Link>
                  ) : (
                    e.title
                  )}{' '}
                  <span className="text-muted">· {e.teamName}</span>
                </td>
                <td className="py-2 text-muted">{e.track ?? '—'}</td>
                <td className="py-2 tabular-nums">
                  {e.finalReviews}
                  {e.changedAfterReview > 0 ? (
                    <span
                      className="ml-2"
                      title="The team changed this entry after these judges submitted; they scored an earlier version."
                    >
                      <Badge tone="warning">{e.changedAfterReview} of an earlier version</Badge>
                    </span>
                  ) : null}
                </td>
                <td className="py-2">
                  <Badge tone={e.state === 'IN_JUDGING' ? 'neutral' : 'warning'}>
                    {STATE[e.state]}
                  </Badge>
                  {e.disqualifyReason ? (
                    <p className="mt-1 text-muted">Reason: {e.disqualifyReason}</p>
                  ) : null}
                </td>
                <td className="py-2 text-right">
                  {e.state === 'DISQUALIFIED' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Reinstate “${e.title}”? It returns to the gallery and judging.`,
                          )
                        ) {
                          void send(() => apiPost(`/api/submissions/${e.id}/reinstate`));
                        }
                      }}
                    >
                      Reinstate
                    </Button>
                  ) : open === e.id ? (
                    <form
                      onSubmit={(ev) => disqualify(ev, e.id)}
                      className="flex flex-wrap items-center justify-end gap-2"
                    >
                      <label htmlFor={`reason-${e.id}`} className="sr-only">
                        Reason for disqualifying {e.title}
                      </label>
                      <Input
                        id={`reason-${e.id}`}
                        className="w-56"
                        placeholder="Reason (the team sees it)"
                        value={reason}
                        onChange={(ev) => setReason(ev.target.value)}
                        minLength={3}
                        maxLength={500}
                        required
                        autoFocus
                      />
                      <Button type="submit" disabled={busy}>
                        Disqualify
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => setOpen(null)}>
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setOpen(e.id);
                        setReason('');
                      }}
                    >
                      Disqualify…
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
