'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, EmptyState, ErrorState } from '@/components/ui';
import { apiDelete, apiPost, apiPut } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';

type Judge = Schemas['JudgeDto'];
type Track = Schemas['EventTrackDto'];

/** Track checkboxes, named so a form can read them back. */
function TrackChoices({
  tracks,
  chosen,
  name,
}: {
  tracks: Track[];
  chosen: string[];
  name: string;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {tracks.map((t) => (
        <label key={t.id} className="flex items-center gap-1 text-sm">
          <input type="checkbox" name={name} value={t.id} defaultChecked={chosen.includes(t.id)} />
          {t.name}
        </label>
      ))}
    </div>
  );
}

const checked = (form: HTMLFormElement, name: string) =>
  new FormData(form).getAll(name).map(String);

/**
 * The event's judges and invite links. A judge sees and scores only the tracks chosen here.
 * The API refuses what breaks the rules (a judge with reviews cannot be removed) and its
 * message is shown as is.
 */
export function JudgesEditor({
  eventId,
  judges,
  tracks,
}: {
  eventId: string;
  judges: Judge[];
  tracks: Track[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ url: string; expiresAt: string; maxUses: number } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveTracks(e: FormEvent<HTMLFormElement>, judge: Judge) {
    e.preventDefault();
    const trackIds = checked(e.currentTarget, 'tracks');
    const ok = await run(() =>
      apiPut(`/api/events/${eventId}/judges/${judge.judgeId}/tracks`, { tracks: trackIds }),
    );
    if (ok) setEditing(null);
  }

  function remove(judge: Judge) {
    if (!window.confirm(`Remove ${judge.name} as a judge?`)) return;
    void run(() => apiDelete(`/api/events/${eventId}/judges/${judge.judgeId}`));
  }

  async function createInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const maxUses = Number(new FormData(form).get('maxUses')) || 1;
    setCopied(false);
    await run(async () => {
      const res = await apiPost<Schemas['JudgeInviteDto']>(`/api/events/${eventId}/judge-invites`, {
        tracks: checked(form, 'invite-tracks'),
        maxUses,
      });
      setInvite({
        url: `${window.location.origin}${res.path}`,
        expiresAt: res.expiresAt,
        maxUses: res.maxUses,
      });
    });
  }

  return (
    <div className="space-y-6">
      {judges.length === 0 ? (
        <EmptyState title="No judges yet">
          Create an invite link below and send it to them.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border">
          {judges.map((j) => (
            <li key={j.judgeId} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="text-sm">
                  <p>
                    {j.name} <span className="text-muted">· {j.email}</span>
                  </p>
                  <p className="text-muted">
                    {j.tracks.length ? j.tracks.map((t) => t.name).join(', ') : 'no tracks'}
                    {' · '}
                    {j.assigned
                      ? `${j.finished} of ${j.assigned} finished`
                      : 'nothing assigned yet'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {tracks.length ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => setEditing(editing === j.judgeId ? null : j.judgeId)}
                    >
                      Tracks
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => remove(j)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
              {editing === j.judgeId ? (
                <form onSubmit={(e) => saveTracks(e, j)} className="mt-2 space-y-2">
                  <TrackChoices tracks={tracks} chosen={j.tracks.map((t) => t.id)} name="tracks" />
                  <Button type="submit" disabled={busy}>
                    Save tracks
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={createInvite} className="space-y-3 rounded-md border border-border p-3">
        <p className="text-sm font-medium">Invite judges</p>
        {tracks.length ? (
          <TrackChoices tracks={tracks} chosen={[]} name="invite-tracks" />
        ) : (
          <p className="text-sm text-muted">This event has no tracks: judges see every project.</p>
        )}
        <label className="flex items-center gap-2 text-sm">
          People who can use the link
          <input
            name="maxUses"
            type="number"
            min={1}
            max={50}
            defaultValue={1}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1"
          />
        </label>
        <Button type="submit" disabled={busy}>
          Create judge invite link
        </Button>
        {invite ? (
          <div className="space-y-1">
            <div className="flex gap-2">
              <label htmlFor="judge-invite-url" className="sr-only">
                Judge invite link
              </label>
              <input
                id="judge-invite-url"
                readOnly
                value={invite.url}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(invite.url);
                    setCopied(true);
                  } catch {
                    // Clipboard access can be blocked; the link is selectable in the box.
                  }
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-xs text-muted">
              Shown once. {invite.maxUses} {invite.maxUses === 1 ? 'person' : 'people'} can use it
              until {formatUtc(invite.expiresAt)}.
            </p>
          </div>
        ) : null}
      </form>
      {error ? <ErrorState title="Not changed" message={error} /> : null}
    </div>
  );
}
