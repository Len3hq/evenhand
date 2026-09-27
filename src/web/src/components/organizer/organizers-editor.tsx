'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, ErrorState, Input, Label } from '@/components/ui';
import { apiDelete, apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

/**
 * Who runs the event. Add by email (the person registers first: nothing is emailed). The API
 * refuses the last organiser's removal and anyone who competes in or judges the event, and its
 * message is shown as is.
 */
export function OrganizersEditor({
  eventId,
  organizers,
  myId,
}: {
  eventId: string;
  organizers: Schemas['OrganizerDto'][];
  myId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, after?: () => void) {
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

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get('email') ?? '').trim();
    void run(
      () => apiPost(`/api/events/${eventId}/organizers`, { email }),
      () => form.reset(),
    );
  }

  function onRemove(o: Schemas['OrganizerDto']) {
    const who = o.userId === myId ? 'yourself' : o.name;
    if (!window.confirm(`Remove ${who} as an organiser of this event?`)) return;
    void run(
      () => apiDelete(`/api/events/${eventId}/organizers/${o.userId}`),
      // Stepping down: this page is no longer yours to see.
      () => (o.userId === myId ? router.push('/organizer') : undefined),
    );
  }

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {organizers.map((o) => (
          <li key={o.userId} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {o.name} <span className="text-muted">· {o.email}</span>
              {o.userId === myId ? <span className="text-muted"> (you)</span> : null}
            </span>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onRemove(o)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd} className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="new-organizer">Add an organiser (their account email)</Label>
          <Input id="new-organizer" name="email" type="email" required />
        </div>
        <Button type="submit" disabled={busy}>
          Add organiser
        </Button>
      </form>
      {error ? <ErrorState title="Not changed" message={error} /> : null}
    </div>
  );
}
