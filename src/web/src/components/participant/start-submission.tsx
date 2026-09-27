'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, ErrorState, Input, Label } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

/** Creates the team's draft with just a title; the rest is filled in on the next page. */
export function StartSubmission({ eventSlug }: { eventSlug: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title = String(new FormData(e.currentTarget).get('title') ?? '').trim();
    setPending(true);
    setError(null);
    try {
      const draft = await apiPost<Schemas['SubmissionDto']>(
        `/api/events/${eventSlug}/submissions`,
        { title },
      );
      router.push(`/submissions/${draft.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the submission.');
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor="project-title">Project title</Label>
        <Input id="project-title" name="title" required maxLength={120} />
      </div>
      {error ? <ErrorState title="Not started" message={error} /> : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Starting…' : 'Start the submission'}
      </Button>
    </form>
  );
}
