'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorState, Input } from '@/components/ui';
import { apiPut } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

type Row = { id?: string; prompt: string; required: boolean; isPublic: boolean };

const MAX_QUESTIONS = 20;

/**
 * The questions every submission answers, in order. The API decides what may change once teams
 * have answered or submitted (answered questions stay; private answers never become public;
 * nothing becomes required that a submitted entry left empty) and says why when it refuses.
 */
export function QuestionsEditor({
  eventId,
  questions,
}: {
  eventId: string;
  questions: Schemas['QuestionDto'][];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    questions.map(({ id, prompt, required, isPublic }) => ({ id, prompt, required, isPublic })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const update = (i: number, patch: Partial<Row>) => {
    setSaved(false);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };
  const move = (i: number, by: -1 | 1) => {
    setSaved(false);
    setRows((rs) => {
      const next = [...rs];
      [next[i], next[i + by]] = [next[i + by]!, next[i]!];
      return next;
    });
  };

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await apiPut<Schemas['QuestionsDto']>(`/api/events/${eventId}/questions`, {
        questions: rows,
      });
      // New rows now have ids: keep them, so the next save edits rather than re-adds.
      setRows(
        res.questions.map(({ id, prompt, required, isPublic }) => ({
          id,
          prompt,
          required,
          isPublic,
        })),
      );
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The questions were not saved.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {rows.length ? (
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id ?? `new-${i}`} className="rounded-md border border-border p-3">
              <label className="sr-only" htmlFor={`question-${i}-prompt`}>
                Question {i + 1}
              </label>
              <Input
                id={`question-${i}-prompt`}
                value={r.prompt}
                maxLength={300}
                required
                placeholder="What should every team tell you?"
                onChange={(e) => update(i, { prompt: e.target.value })}
              />
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={r.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                  />
                  Required to submit
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={r.isPublic}
                    onChange={(e) => update(i, { isPublic: e.target.checked })}
                  />
                  Show answers in the public gallery
                </label>
                <span className="ml-auto flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`Move question ${i + 1} up`}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`Move question ${i + 1} down`}
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setSaved(false);
                      setRows((rs) => rs.filter((_, j) => j !== i));
                    }}
                  >
                    Remove
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">
          No questions yet. Teams fill in the standard fields only.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={rows.length >= MAX_QUESTIONS}
          onClick={() => setRows((rs) => [...rs, { prompt: '', required: false, isPublic: false }])}
        >
          Add question
        </Button>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save questions'}
        </Button>
      </div>
      {error ? <ErrorState title="Questions not saved" message={error} /> : null}
      {saved ? (
        <p role="status" className="text-sm text-accent">
          Saved.
        </p>
      ) : null}
    </div>
  );
}
