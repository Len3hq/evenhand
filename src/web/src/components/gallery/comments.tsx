'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Badge, Button, ErrorState, Input } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';

type Comment = Schemas['CommentDto'];

const MAX = 2000;

/**
 * A public project's comments. Anyone logged in can post; the event's organisers can hide a
 * comment with a reason and restore it. The API decides all of this; the page only offers what
 * the viewer may do and shows the API's answer.
 */
export function Comments({
  projectId,
  comments,
  loggedIn,
  moderator,
  loginHref,
}: {
  projectId: string;
  comments: Comment[];
  loggedIn: boolean;
  moderator: boolean;
  loginHref: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiding, setHiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  async function act(action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      after?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function onPost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void act(
      () => apiPost(`/api/projects/${projectId}/comments`, { body }),
      () => setBody(''),
    );
  }

  return (
    <section aria-labelledby="comments-title" className="space-y-4">
      <h2 id="comments-title" className="text-lg font-semibold">
        Comments{' '}
        <span className="font-mono text-sm text-muted">
          ({comments.filter((c) => !c.hidden).length})
        </span>
      </h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted">No comments yet.</p>
      ) : (
        <ol className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className={`rounded-xl border border-border bg-surface p-4 ${c.hidden ? 'opacity-70' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{c.author.name}</span>
                <span className="font-mono text-xs text-muted">{formatUtc(c.createdAt)}</span>
                {c.hidden ? <Badge tone="warning">Hidden: {c.hideReason}</Badge> : null}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm">{c.body}</p>
              {moderator ? (
                <div className="mt-3">
                  {c.hidden ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-3 py-1 text-xs"
                      disabled={busy}
                      onClick={() => void act(() => apiPost(`/api/comments/${c.id}/restore`))}
                    >
                      Restore
                    </Button>
                  ) : hiding === c.id ? (
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void act(
                          () => apiPost(`/api/comments/${c.id}/hide`, { reason }),
                          () => {
                            setHiding(null);
                            setReason('');
                          },
                        );
                      }}
                    >
                      <label htmlFor={`hide-${c.id}`} className="sr-only">
                        Why hide this comment
                      </label>
                      <Input
                        id={`hide-${c.id}`}
                        className="w-64"
                        placeholder="Reason (kept in the audit trail)"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        minLength={3}
                        maxLength={300}
                        required
                        autoFocus
                      />
                      <Button type="submit" className="px-3 py-1 text-xs" disabled={busy}>
                        Hide
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="px-3 py-1 text-xs"
                        onClick={() => setHiding(null)}
                      >
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-3 py-1 text-xs"
                      disabled={busy}
                      onClick={() => {
                        setHiding(c.id);
                        setReason('');
                      }}
                    >
                      Hide…
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {loggedIn ? (
        <form onSubmit={onPost} className="space-y-2">
          <label htmlFor="comment-body" className="block text-sm font-medium">
            Add a comment
          </label>
          <textarea
            id="comment-body"
            rows={3}
            maxLength={MAX}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted">
              {body.length} / {MAX}
            </span>
            <Button type="submit" disabled={busy || !body.trim()}>
              {busy ? 'Posting…' : 'Post comment'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">
          <Link href={loginHref} className="underline">
            Log in
          </Link>{' '}
          to comment.
        </p>
      )}
      {error ? <ErrorState title="Not done" message={error} /> : null}
    </section>
  );
}
