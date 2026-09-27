'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, ErrorState, Input, Label } from '@/components/ui';
import { apiPatch, apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';
import { fromInput, toInput } from '@/lib/dates';

type Event = Schemas['EventDto'];

/**
 * Create an event, or edit one's name and dates. The API checks the rules (dates in order,
 * slug free, who may do it) and its message is shown as is.
 */
export function EventForm({ event }: { event?: Event }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    const dates = {
      opensAt: fromInput(text('opensAt')),
      submissionsClose: fromInput(text('submissionsClose')),
      judgingClose: fromInput(text('judgingClose')),
    };
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      if (event) {
        await apiPatch(`/api/events/${event.id}`, { name: text('name'), ...dates });
        setSaved(true);
        router.refresh();
      } else {
        const created = await apiPost<Event>('/api/events', {
          name: text('name'),
          ...(text('slug') ? { slug: text('slug') } : {}),
          ...(dates.opensAt ? { opensAt: dates.opensAt } : {}),
          submissionsClose: dates.submissionsClose,
          ...(dates.judgingClose ? { judgingClose: dates.judgingClose } : {}),
        });
        router.push(`/organizer/events/${created.slug}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the event.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required maxLength={120} defaultValue={event?.name} />
      </div>
      {event ? null : (
        <div>
          <Label htmlFor="slug">Web address (optional)</Label>
          <Input
            id="slug"
            name="slug"
            maxLength={60}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="spring-hack-2026 (made from the name if empty)"
          />
          <p className="mt-1 text-xs text-muted">
            Fixed once the event exists, so links keep working.
          </p>
        </div>
      )}
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Dates (all times UTC)</legend>
        <div>
          <Label htmlFor="opensAt">Submissions open (optional)</Label>
          <Input
            id="opensAt"
            name="opensAt"
            type="datetime-local"
            defaultValue={toInput(event?.opensAt ?? null)}
          />
        </div>
        <div>
          <Label htmlFor="submissionsClose">Submissions close</Label>
          <Input
            id="submissionsClose"
            name="submissionsClose"
            type="datetime-local"
            required
            defaultValue={toInput(event?.submissionsClose ?? null)}
          />
        </div>
        <div>
          <Label htmlFor="judgingClose">Judging closes (optional)</Label>
          <Input
            id="judgingClose"
            name="judgingClose"
            type="datetime-local"
            defaultValue={toInput(event?.judgingClose ?? null)}
          />
        </div>
      </fieldset>
      {error ? <ErrorState title="Not saved" message={error} /> : null}
      {saved ? (
        <p role="status" className="text-sm text-accent">
          Saved.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : event ? 'Save changes' : 'Create event'}
      </Button>
    </form>
  );
}
