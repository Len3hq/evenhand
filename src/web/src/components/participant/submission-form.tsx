'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, ErrorState, Input, Label } from '@/components/ui';
import { apiPatch, apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

type Submission = Schemas['SubmissionDto'];

const textarea =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent';

/**
 * The team's submission. Save keeps it as it is (a draft, or the submitted entry); Submit saves
 * and then submits. `readOnly` when the deadline has passed or the viewer is not on the team:
 * the API would refuse the write anyway, this just says so up front.
 */
export function SubmissionForm({
  submission,
  tracks,
  readOnly,
}: {
  submission: Submission;
  tracks: Schemas['EventTrackDto'][];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /** Everything in the form, as the API expects it: empty optional fields are cleared. */
  function body(form: HTMLFormElement) {
    const data = new FormData(form);
    const text = (k: string) => String(data.get(k) ?? '').trim();
    const orNull = (k: string) => text(k) || null;
    return {
      title: text('title'),
      tagline: orNull('tagline'),
      summary: orNull('summary'),
      description: orNull('description'),
      repoUrl: orNull('repoUrl'),
      demoVideoUrl: orNull('demoVideoUrl'),
      liveUrl: orNull('liveUrl'),
      techTags: text('techTags')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      track: orNull('track'),
    };
  }

  async function save(form: HTMLFormElement, then?: () => Promise<unknown>, done = 'Saved.') {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      await apiPatch(`/api/submissions/${submission.id}`, body(form));
      if (then) await then();
      setNotice(done);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not saved.');
    } finally {
      setPending(false);
    }
  }

  function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void save(e.currentTarget);
  }

  function onSubmitEntry(form: HTMLFormElement | null) {
    if (!form || !form.reportValidity()) return;
    void save(
      form,
      () => apiPost(`/api/submissions/${submission.id}/submit`),
      'Submitted. It is in the gallery, and you can keep editing until the deadline.',
    );
  }

  return (
    <form onSubmit={onSave} className="space-y-4" id="submission-form">
      <fieldset disabled={readOnly || pending} className="space-y-4">
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" required maxLength={120} defaultValue={submission.title} />
        </div>
        <div>
          <Label htmlFor="tagline">Tagline</Label>
          <Input
            id="tagline"
            name="tagline"
            maxLength={160}
            defaultValue={submission.tagline ?? ''}
          />
        </div>
        <div>
          <Label htmlFor="summary">Summary (needed to submit; shown on the gallery card)</Label>
          <textarea
            id="summary"
            name="summary"
            rows={2}
            maxLength={500}
            defaultValue={submission.summary ?? ''}
            className={textarea}
          />
        </div>
        <div>
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            name="description"
            rows={8}
            maxLength={20000}
            defaultValue={submission.description ?? ''}
            className={textarea}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="repoUrl">Repository</Label>
            <Input
              id="repoUrl"
              name="repoUrl"
              type="url"
              placeholder="https://"
              defaultValue={submission.repoUrl ?? ''}
            />
          </div>
          <div>
            <Label htmlFor="demoVideoUrl">Demo video</Label>
            <Input
              id="demoVideoUrl"
              name="demoVideoUrl"
              type="url"
              placeholder="https://"
              defaultValue={submission.demoVideoUrl ?? ''}
            />
          </div>
          <div>
            <Label htmlFor="liveUrl">Live site</Label>
            <Input
              id="liveUrl"
              name="liveUrl"
              type="url"
              placeholder="https://"
              defaultValue={submission.liveUrl ?? ''}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="techTags">Technologies (comma separated)</Label>
            <Input
              id="techTags"
              name="techTags"
              placeholder="typescript, postgres"
              defaultValue={submission.techTags.join(', ')}
            />
          </div>
          <div>
            <Label htmlFor="track">Track</Label>
            <select
              id="track"
              name="track"
              defaultValue={submission.trackId ?? ''}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <option value="">No track</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      {error ? <ErrorState title="Not saved" message={error} /> : null}
      {notice ? (
        <p role="status" className="text-sm text-accent">
          {notice}
        </p>
      ) : null}

      {readOnly ? null : (
        <div className="flex flex-wrap gap-3">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          {submission.status === 'DRAFT' ? (
            <Button
              type="button"
              disabled={pending}
              onClick={(e) => onSubmitEntry(e.currentTarget.form)}
            >
              Save and submit
            </Button>
          ) : null}
        </div>
      )}
    </form>
  );
}
