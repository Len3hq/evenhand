'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, Input, Label } from '@/components/ui';
import { apiDelete, apiPatch, apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

type Prize = Schemas['EventPrizeDto'];
type Track = Schemas['EventTrackDto'];

const OVERALL = '';

/** Add, edit and remove prizes: overall, or for one track of this event. */
export function PrizesEditor({
  eventId,
  prizes,
  tracks,
}: {
  eventId: string;
  prizes: Prize[];
  tracks: Track[];
}) {
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

  const fields = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const text = (k: string) => String(data.get(k) ?? '').trim();
    return {
      name: text('name'),
      description: text('description') || null,
      track: text('track') || null,
    };
  };

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const { name, description, track } = fields(form);
    void run(async () => {
      await apiPost(`/api/events/${eventId}/prizes`, {
        name,
        ...(description ? { description } : {}),
        ...(track ? { track } : {}),
      });
      form.reset();
    });
  }

  function onSave(e: FormEvent<HTMLFormElement>, prize: Prize) {
    e.preventDefault();
    void run(() => apiPatch(`/api/events/${eventId}/prizes/${prize.id}`, fields(e.currentTarget)));
  }

  function onRemove(prize: Prize) {
    if (!window.confirm(`Remove the prize "${prize.name}"?`)) return;
    void run(() => apiDelete(`/api/events/${eventId}/prizes/${prize.id}`));
  }

  const trackSelect = (id: string, value: string | null) => (
    <select
      id={id}
      name="track"
      defaultValue={value ?? OVERALL}
      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
    >
      <option value={OVERALL}>Overall (every track)</option>
      {tracks.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );

  const prizeFields = (idPrefix: string, prize?: Prize) => (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label htmlFor={`${idPrefix}-name`}>Prize</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          required
          maxLength={120}
          defaultValue={prize?.name}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-description`}>Description (optional)</Label>
        <Input
          id={`${idPrefix}-description`}
          name="description"
          maxLength={2000}
          defaultValue={prize?.description ?? ''}
          placeholder="e.g. $500"
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-track`}>For</Label>
        {trackSelect(`${idPrefix}-track`, prize?.trackId ?? null)}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {prizes.length === 0 ? (
        <EmptyState title="No prizes yet" />
      ) : (
        <ul className="space-y-3">
          {prizes.map((p) => (
            <li key={p.id}>
              <Card>
                <form onSubmit={(e) => onSave(e, p)} className="space-y-3">
                  {prizeFields(`prize-${p.id}`, p)}
                  <div className="flex gap-2">
                    <Button type="submit" variant="secondary" disabled={busy}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => onRemove(p)}
                    >
                      Remove
                    </Button>
                  </div>
                </form>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Card>
        <form onSubmit={onAdd} className="space-y-3">
          <p className="text-sm font-medium">New prize</p>
          {prizeFields('new-prize')}
          <Button type="submit" disabled={busy}>
            Add prize
          </Button>
        </form>
      </Card>
      {error ? <ErrorState title="Not saved" message={error} /> : null}
    </div>
  );
}
