'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, EmptyState, ErrorState, Input, Label } from '@/components/ui';
import { apiDelete, apiPatch, apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

type Track = Schemas['EventTrackDto'];

/**
 * Add, rename and remove tracks. Removing a track that still has projects, prizes or judges
 * is refused by the API, and its message (what is still in the track) is shown.
 */
export function TracksEditor({ eventId, tracks }: { eventId: string; tracks: Track[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    void run(async () => {
      await apiPost(`/api/events/${eventId}/tracks`, { name });
      form.reset();
    });
  }

  function onRename(e: FormEvent<HTMLFormElement>, track: Track) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    void run(() => apiPatch(`/api/events/${eventId}/tracks/${track.id}`, { name }));
  }

  function onRemove(track: Track) {
    if (!window.confirm(`Remove the track "${track.name}"?`)) return;
    void run(() => apiDelete(`/api/events/${eventId}/tracks/${track.id}`));
  }

  return (
    <div className="space-y-4">
      {tracks.length === 0 ? (
        <EmptyState title="No tracks yet">Projects can still be submitted without one.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {tracks.map((t) => (
            <li key={t.id}>
              <form onSubmit={(e) => onRename(e, t)} className="flex items-center gap-2">
                <label htmlFor={`track-${t.id}`} className="sr-only">
                  Track name
                </label>
                <Input
                  id={`track-${t.id}`}
                  name="name"
                  defaultValue={t.name}
                  required
                  maxLength={80}
                />
                <Button type="submit" variant="secondary" disabled={busy}>
                  Rename
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onRemove(t)}
                >
                  Remove
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={onAdd} className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="new-track">New track</Label>
          <Input
            id="new-track"
            name="name"
            required
            maxLength={80}
            placeholder="e.g. Developer tools"
          />
        </div>
        <Button type="submit" disabled={busy}>
          Add track
        </Button>
      </form>
      {error ? <ErrorState title="Not saved" message={error} /> : null}
    </div>
  );
}
