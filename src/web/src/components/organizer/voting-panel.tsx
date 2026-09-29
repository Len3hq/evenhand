'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Badge, Button, ErrorState, Input, Label } from '@/components/ui';
import { apiPost, apiPut } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';
import { formatUtc, fromInput, toInput } from '@/lib/dates';

type Admin = Schemas['VotingAdminDto'];
type Mode = Schemas['ConfigureVotingDto']['mode'];

const MODES: { value: Mode; label: string; hint: string }[] = [
  {
    value: 'ACCOUNTS',
    label: 'Anyone with an account',
    hint: 'Voters log in; nobody can vote for their own team.',
  },
  {
    value: 'EMAIL_LIST',
    label: 'A list of emails',
    hint: 'Each email gets a personal link; no account needed.',
  },
  {
    value: 'OPEN_LINK',
    label: 'A shared link',
    hint: 'Anyone with the link gets a ballot; the weakest against one person voting twice.',
  },
];

/**
 * The community vote for one event: its settings, how voters get in, the running tally (for
 * organisers only) and publishing. The API enforces every rule; this shows its answers.
 */
export function VotingPanel({
  eventId,
  eventSlug,
  admin,
}: {
  eventId: string;
  eventSlug: string;
  admin: Admin;
}) {
  const router = useRouter();
  const round = admin.round;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [emails, setEmails] = useState('');
  const [issued, setIssued] = useState<Schemas['IssuedPassesDto'] | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (k: string) => String(form.get(k) ?? '').trim();
    void act(async () => {
      await apiPut(`/api/events/${eventId}/voting`, {
        mode: text('mode'),
        opensAt: fromInput(text('opensAt')),
        closesAt: fromInput(text('closesAt')),
        votesPerVoter: Number(text('votesPerVoter')),
      });
      setSaved(true);
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSave} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Who may vote</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <label
                key={m.value}
                className="flex cursor-pointer gap-2 rounded-lg border border-border p-3 text-sm has-[:checked]:border-accent"
              >
                <input
                  type="radio"
                  name="mode"
                  value={m.value}
                  defaultChecked={(round?.mode ?? 'ACCOUNTS') === m.value}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-muted">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-medium">When (all times UTC)</legend>
          <div>
            <Label htmlFor="opensAt">Voting opens</Label>
            <Input
              id="opensAt"
              name="opensAt"
              type="datetime-local"
              required
              defaultValue={toInput(round?.opensAt ?? null)}
            />
          </div>
          <div>
            <Label htmlFor="closesAt">Voting closes</Label>
            <Input
              id="closesAt"
              name="closesAt"
              type="datetime-local"
              required
              defaultValue={toInput(round?.closesAt ?? null)}
            />
          </div>
          <div>
            <Label htmlFor="votesPerVoter">Votes per voter</Label>
            <Input
              id="votesPerVoter"
              name="votesPerVoter"
              type="number"
              min={1}
              max={10}
              required
              defaultValue={round?.votesPerVoter ?? 3}
            />
          </div>
        </fieldset>
        <p className="text-xs text-muted">
          {round?.resultsPublishedAt
            ? 'The results are published, so this vote is final.'
            : 'Who may vote and how many votes each has are fixed once the first vote is cast; the dates can move until the results are published.'}
        </p>
        <Button type="submit" disabled={busy || Boolean(round?.resultsPublishedAt)}>
          {round ? 'Save vote settings' : 'Set up the vote'}
        </Button>
        {saved ? (
          <p role="status" className="text-sm text-accent">
            Saved.
          </p>
        ) : null}
      </form>

      {error ? <ErrorState title="Not done" message={error} /> : null}

      {round ? (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {round.open ? (
              <Badge tone="success">Open now</Badge>
            ) : round.closed ? (
              <Badge>Closed</Badge>
            ) : (
              <Badge tone="warning">Not open yet</Badge>
            )}
            <span className="font-mono text-xs text-muted">
              {formatUtc(round.opensAt)} → {formatUtc(round.closesAt)} · {admin.ballots} voter
              {admin.ballots === 1 ? '' : 's'} · {admin.votes} vote{admin.votes === 1 ? '' : 's'}
              {round.mode === 'ACCOUNTS' ? '' : ` · ${admin.passes} personal link(s)`}
            </span>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">How voters get in</h3>
            {round.mode === 'ACCOUNTS' ? (
              <p className="text-sm">
                Share this page with voters:{' '}
                <Link href={`/events/${eventSlug}/vote`} className="font-mono underline">
                  /events/{eventSlug}/vote
                </Link>
              </p>
            ) : null}

            {round.mode === 'EMAIL_LIST' ? (
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    setIssued(
                      await apiPost<Schemas['IssuedPassesDto']>(
                        `/api/events/${eventId}/voting/passes`,
                        { emails: emails.split(/[\s,;]+/).filter(Boolean) },
                      ),
                    );
                    setEmails('');
                  });
                }}
              >
                <Label htmlFor="voter-emails">Voters’ emails (one per line)</Label>
                <textarea
                  id="voter-emails"
                  rows={4}
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-fg focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-accent"
                />
                <Button type="submit" disabled={busy || !emails.trim()}>
                  Make personal links
                </Button>
              </form>
            ) : null}

            {issued ? (
              <div className="space-y-2 rounded-lg border border-accent p-3 text-sm">
                <p className="font-medium">
                  Send each person their link now: it is shown only this once.
                </p>
                {issued.created.length ? (
                  <ul className="space-y-1 font-mono text-xs">
                    {issued.created.map((p) => (
                      <li key={p.email} className="break-all">
                        {p.email} → {origin}/vote/{p.token}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {issued.skipped.length ? (
                  <p className="text-muted">
                    Skipped (already had a link, or not an email): {issued.skipped.join(', ')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {round.mode === 'OPEN_LINK' ? (
              <div className="space-y-2">
                <p className="text-sm text-muted">
                  {round.hasLink
                    ? 'A shared link exists. Making a new one stops the old one working (ballots already taken keep working).'
                    : 'No shared link yet.'}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const link = await apiPost<Schemas['VotingLinkDto']>(
                        `/api/events/${eventId}/voting/link`,
                      );
                      setShared(link.token);
                    })
                  }
                >
                  {round.hasLink ? 'Make a new shared link' : 'Make the shared link'}
                </Button>
                {shared ? (
                  <p className="break-all rounded-lg border border-accent p-3 font-mono text-xs">
                    {origin}/vote/link/{shared}
                    <span className="mt-1 block font-sans text-muted">
                      Copy it now: it is shown only this once.
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {round.mode === 'OPEN_LINK' && admin.passes > 0 && admin.passesWithAddress === 0 ? (
            <p role="note" className="rounded-lg border border-border p-3 text-sm text-muted">
              The portal cannot see voters’ addresses (no proxy in front of it reports them), so one
              person taking several ballots cannot be spotted by address. A browser that follows the
              link again gets its own ballot back, but a private window or another device gets a new
              one. For a vote with a prize, use accounts or emailed links.
            </p>
          ) : null}
          {admin.repeatAddresses > 0 ? (
            <p role="note" className="rounded-lg border border-warning p-3 text-sm">
              {admin.repeatBallots} ballots were taken by {admin.repeatAddresses} address
              {admin.repeatAddresses === 1 ? '' : 'es'} that took more than one: possibly one person
              voting several times, or several people on one network. Their votes are counted apart
              in the tally below; check them before publishing.
            </p>
          ) : null}

          <div className="space-y-2">
            <h3 className="font-semibold">Tally</h3>
            <p className="text-sm text-muted">
              Only organisers see this until the vote closes and it is published.
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th scope="col" className="py-1 pr-2 font-medium">
                    Project
                  </th>
                  <th scope="col" className="py-1 pr-2 font-medium">
                    Team
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Votes
                  </th>
                  {round.mode === 'OPEN_LINK' ? (
                    <th scope="col" className="py-1 pl-2 text-right font-medium">
                      From repeat addresses
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {admin.tallies.map((r) => (
                  <tr key={r.projectId} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-2">{r.title}</td>
                    <td className="py-1.5 pr-2 text-muted">{r.teamName}</td>
                    <td className="py-1.5 text-right font-mono">{r.votes}</td>
                    {round.mode === 'OPEN_LINK' ? (
                      <td className="py-1.5 pl-2 text-right font-mono">{r.repeatVotes}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            {round.resultsPublishedAt ? (
              <p className="text-sm">
                Published {formatUtc(round.resultsPublishedAt)}:{' '}
                <Link href={`/events/${eventSlug}/vote/results`} className="underline">
                  the public page
                </Link>
              </p>
            ) : (
              <>
                <Button
                  type="button"
                  disabled={busy || !round.closed}
                  onClick={() =>
                    void act(async () => {
                      await apiPost(`/api/events/${eventId}/voting/publish`);
                    })
                  }
                >
                  Publish the vote
                </Button>
                <p className="text-xs text-muted">
                  Possible once voting has closed ({formatUtc(round.closesAt)}).
                </p>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
