'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, ErrorState } from '@/components/ui';
import { apiPost, apiPut } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

type Review = Schemas['ReviewDto'];
type Saving = 'idle' | 'saving' | 'saved' | 'error';

const AUTOSAVE_MS = 700;

/**
 * Marks and a comment for one project. Every change is saved as a draft shortly after you make
 * it; Submit saves, makes the review final and opens the next project in your queue. The API
 * checks every mark against the rubric and refuses changes once final or after judging closes.
 */
export function ReviewForm({ review }: { review: Review }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, number>>(review.values);
  const [comment, setComment] = useState(review.comment);
  const [saving, setSaving] = useState<Saving>('idle');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ values, comment });
  const readOnly = review.state === 'FINAL' || !review.judgingOpen;

  async function flush(): Promise<boolean> {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setSaving('saving');
    try {
      await apiPut(`/api/judge/reviews/${review.assignmentId}`, latest.current);
      setSaving('saved');
      setError(null);
      return true;
    } catch (err) {
      setSaving('error');
      setError(err instanceof Error ? err.message : 'Not saved.');
      return false;
    }
  }

  function change(next: { values?: Record<string, number>; comment?: string }) {
    latest.current = { ...latest.current, ...next };
    if (next.values) setValues(next.values);
    if (next.comment !== undefined) setComment(next.comment);
    setSaving('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  /** Leaves for another project, saving a pending change first so no mark is lost. */
  async function go(assignmentId: string) {
    if (timer.current && !readOnly && !(await flush())) return;
    router.push(`/judging/${assignmentId}`);
  }

  async function submit() {
    const missing = review.criteria.filter((c) => values[c.key] === undefined);
    if (missing.length) {
      setError(
        `Mark every criterion before submitting: ${missing.map((c) => c.label).join(', ')}.`,
      );
      return;
    }
    if (!window.confirm('Submit this review? It is final and cannot be changed afterwards.'))
      return;
    setSubmitting(true);
    if (!(await flush())) {
      setSubmitting(false);
      return;
    }
    try {
      await apiPost(`/api/judge/reviews/${review.assignmentId}/submit`);
      router.push(review.nextAssignmentId ? `/judging/${review.nextAssignmentId}` : '/judging');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not submitted.');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {review.state === 'FINAL'
            ? 'Submitted'
            : review.judgingOpen
              ? 'Your marks'
              : 'Judging closed'}
        </span>
        <span className="text-muted" role="status">
          {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Draft saved' : ''}
        </span>
      </div>

      {review.criteria.map((c) => (
        <fieldset key={c.key} disabled={readOnly}>
          <legend className="text-sm font-medium">
            {c.label}{' '}
            <span className="font-normal text-muted">
              ({Math.round(c.share * 100)}% of the score)
            </span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-1">
            {Array.from({ length: c.max - c.min + 1 }, (_, i) => c.min + i).map((n) => (
              <label key={n} className="cursor-pointer">
                <input
                  type="radio"
                  name={`mark-${c.key}`}
                  value={n}
                  checked={values[c.key] === n}
                  onChange={() => change({ values: { ...values, [c.key]: n } })}
                  className="peer sr-only"
                />
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-sm peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-fg peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                  {n}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <div>
        <label htmlFor="review-comment" className="mb-1 block text-sm font-medium">
          Comment for the organisers
        </label>
        <textarea
          id="review-comment"
          rows={4}
          maxLength={5000}
          disabled={readOnly}
          value={comment}
          onChange={(e) => change({ comment: e.target.value })}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>

      {review.weightedScore !== null && review.state === 'FINAL' ? (
        <p className="text-sm">Weighted score: {review.weightedScore.toFixed(2)}</p>
      ) : null}
      {error ? <ErrorState title="Not saved" message={error} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {readOnly ? null : (
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit review'}
          </Button>
        )}
        {(
          [
            ['Previous', review.previousAssignmentId],
            ['Next', review.nextAssignmentId],
          ] as const
        ).map(([label, id]) =>
          id ? (
            <Button key={label} type="button" variant="secondary" onClick={() => void go(id)}>
              {label}
            </Button>
          ) : null,
        )}
      </div>
    </div>
  );
}
