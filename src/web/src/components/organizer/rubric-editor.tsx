'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorState, Input } from '@/components/ui';
import { apiPut } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

type Row = { key?: string; label: string; weight: number; min: number; max: number };

const MAX_CRITERIA = 10;
const cell = 'w-full rounded-md border border-border bg-surface px-2 py-1 text-sm';

/**
 * The weighted rubric. Shares update as you type. Once reviews are final (`locked`), the API
 * only accepts new labels and weights, so adding, removing and ranges are disabled here too.
 */
export function RubricEditor({
  eventId,
  rubric,
}: {
  eventId: string;
  rubric: Schemas['RubricDto'];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    rubric.criteria.map(({ key, label, weight, min, max }) => ({ key, label, weight, min, max })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = rubric.locked;
  const total = rows.reduce((s, r) => s + (Number.isFinite(r.weight) ? r.weight : 0), 0);

  const update = (i: number, patch: Partial<Row>) => {
    setSaved(false);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await apiPut(`/api/events/${eventId}/criteria`, { criteria: rows });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The rubric was not saved.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {locked ? (
        <p className="text-sm text-muted">
          Judging has started: you can rename criteria and change their weights (every score is
          re-weighted), but not add, remove or re-range them.
        </p>
      ) : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="pb-2 font-medium">Criterion</th>
            <th className="w-24 pb-2 font-medium">Weight</th>
            <th className="w-20 pb-2 font-medium">Min</th>
            <th className="w-20 pb-2 font-medium">Max</th>
            <th className="w-20 pb-2 font-medium">Share</th>
            <th className="w-24 pb-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key ?? `new-${i}`}>
              <td className="pr-2 pb-2">
                <label className="sr-only" htmlFor={`criterion-${i}-label`}>
                  Criterion name
                </label>
                <Input
                  id={`criterion-${i}-label`}
                  value={r.label}
                  maxLength={80}
                  required
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </td>
              <td className="pr-2 pb-2">
                <label className="sr-only" htmlFor={`criterion-${i}-weight`}>
                  Weight
                </label>
                <input
                  id={`criterion-${i}-weight`}
                  type="number"
                  min={0}
                  step="any"
                  value={Number.isFinite(r.weight) ? r.weight : ''}
                  onChange={(e) => update(i, { weight: e.target.valueAsNumber })}
                  className={cell}
                />
              </td>
              {(['min', 'max'] as const).map((f) => (
                <td key={f} className="pr-2 pb-2">
                  <label className="sr-only" htmlFor={`criterion-${i}-${f}`}>
                    {f}
                  </label>
                  <input
                    id={`criterion-${i}-${f}`}
                    type="number"
                    step={1}
                    min={0}
                    max={100}
                    disabled={locked}
                    value={Number.isFinite(r[f]) ? r[f] : ''}
                    onChange={(e) => update(i, { [f]: e.target.valueAsNumber })}
                    className={cell}
                  />
                </td>
              ))}
              <td className="pb-2 tabular-nums">
                {total > 0 && Number.isFinite(r.weight)
                  ? `${Math.round((r.weight / total) * 100)}%`
                  : '—'}
              </td>
              <td className="pb-2 text-right">
                {locked ? null : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={rows.length <= 1}
                    onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  >
                    Remove
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap gap-3">
        {locked ? null : (
          <Button
            type="button"
            variant="secondary"
            disabled={rows.length >= MAX_CRITERIA}
            onClick={() => setRows((rs) => [...rs, { label: '', weight: 1, min: 1, max: 5 }])}
          >
            Add criterion
          </Button>
        )}
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save rubric'}
        </Button>
      </div>
      {error ? <ErrorState title="Rubric not saved" message={error} /> : null}
      {saved ? (
        <p role="status" className="text-sm text-accent">
          Saved.
        </p>
      ) : null}
    </div>
  );
}
