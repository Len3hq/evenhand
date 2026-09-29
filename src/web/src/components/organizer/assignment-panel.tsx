'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, ErrorState } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

/**
 * Runs assignment and says what it did. Safe to run again: it only tops projects up (after new
 * judges join or late changes), and never moves work that already exists.
 */
export function AssignmentPanel({
  eventId,
  submissionsOpen,
}: {
  eventId: string;
  /** From the API (server clock): teams can still edit their entries. */
  submissionsOpen: boolean;
}) {
  const router = useRouter();
  const [result, setResult] = useState<Schemas['AssignmentRunDto'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onRun(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const target = Number(new FormData(e.currentTarget).get('target')) || 3;
    setPending(true);
    setError(null);
    try {
      setResult(
        await apiPost<Schemas['AssignmentRunDto']>(`/api/events/${eventId}/assignments/run`, {
          target,
        }),
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment did not run.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {submissionsOpen ? (
        <p role="note" className="rounded-lg border border-warning p-3 text-sm">
          <span className="font-medium text-warning">Submissions are still open.</span> Teams can
          edit their entries until the deadline, so a judge may score a version that later changes.
          Usually, run assignment after submissions close.
        </p>
      ) : null}
      <form onSubmit={onRun} className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          Reviews per project
          <input
            name="target"
            type="number"
            min={1}
            max={10}
            defaultValue={3}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1"
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? 'Assigning…' : 'Run assignment'}
        </Button>
      </form>
      {error ? <ErrorState title="Not assigned" message={error} /> : null}
      {result ? (
        <div className="space-y-3 text-sm" role="status">
          <p>
            <strong>
              {result.added} new assignment{result.added === 1 ? '' : 's'}
            </strong>{' '}
            across {result.projects} project{result.projects === 1 ? '' : 's'} (target{' '}
            {result.target}, seed {result.seed}).
          </p>
          {result.shortfalls.length ? (
            <div>
              <p className="font-medium text-warning">
                {result.shortfalls.length} project{result.shortfalls.length === 1 ? '' : 's'} cannot
                reach {result.target} reviews:
              </p>
              <ul className="list-disc pl-5 text-muted">
                {result.shortfalls.map((s) => (
                  <li key={s.projectId}>
                    {s.title}: {s.have} review{s.have === 1 ? '' : 's'}, {s.eligibleJudges} judge
                    {s.eligibleJudges === 1 ? '' : 's'} cover its track
                  </li>
                ))}
              </ul>
              <p className="text-muted">Invite more judges for those tracks, then run it again.</p>
            </div>
          ) : (
            <p>Every project has {result.target} reviews.</p>
          )}
          {result.components > 1 ? (
            <p className="text-warning">
              The judges form {result.components} separate groups that share no projects, so their
              leniency cannot be compared across groups when scores are normalised.
            </p>
          ) : null}
          <table className="w-full">
            <thead>
              <tr className="text-left text-muted">
                <th className="font-medium">Judge</th>
                <th className="font-medium">New</th>
                <th className="font-medium">In total</th>
              </tr>
            </thead>
            <tbody>
              {result.judges.map((j) => (
                <tr key={j.judgeId}>
                  <td>{j.name}</td>
                  <td className="tabular-nums">{j.added}</td>
                  <td className="tabular-nums">{j.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
