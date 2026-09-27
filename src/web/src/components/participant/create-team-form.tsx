'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, ErrorState, Input, Label } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

/** Start a team in one of the open events; you become its first member. */
export function CreateTeamForm({
  events,
}: {
  events: Pick<Schemas['EventDto'], 'slug' | 'name'>[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const team = await apiPost<Schemas['TeamDto']>(
        `/api/events/${String(form.get('event'))}/teams`,
        {
          name: String(form.get('name') ?? '').trim(),
        },
      );
      router.push(`/teams/${team.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the team.');
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="event">Event</Label>
          <select
            id="event"
            name="event"
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            {events.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="team-name">Team name</Label>
          <Input id="team-name" name="name" required maxLength={80} />
        </div>
      </div>
      {error ? <ErrorState title="Team not created" message={error} /> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create team'}
      </Button>
    </form>
  );
}
