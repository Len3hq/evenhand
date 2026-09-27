'use client';

import { useState } from 'react';
import { Button, ErrorState } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';

/**
 * Makes an invite link for the team. The server keeps only a hash of it, so the link is shown
 * once, here; make a new one if it is lost. Nothing is emailed: copy it to your teammates.
 */
export function InvitePanel({ teamId }: { teamId: string }) {
  const [invite, setInvite] = useState<{ url: string; expiresAt: string; maxUses: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  async function create() {
    setPending(true);
    setError(null);
    setCopied(false);
    try {
      const res = await apiPost<Schemas['InviteDto']>(`/api/teams/${teamId}/invites`);
      setInvite({
        url: `${window.location.origin}${res.path}`,
        expiresAt: res.expiresAt,
        maxUses: res.maxUses,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create an invite link.');
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
    } catch {
      // Clipboard access can be blocked; the link is selectable in the box anyway.
    }
  }

  return (
    <div className="space-y-3">
      {invite ? (
        <div className="space-y-2">
          <label htmlFor="invite-url" className="block text-sm font-medium">
            Invite link (shown once)
          </label>
          <div className="flex gap-2">
            <input
              id="invite-url"
              readOnly
              value={invite.url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs"
            />
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <p className="text-xs text-muted">
            Up to {invite.maxUses} people can join with it until {formatUtc(invite.expiresAt)}.
          </p>
        </div>
      ) : null}
      {error ? <ErrorState title="No invite link" message={error} /> : null}
      <Button type="button" onClick={create} disabled={pending}>
        {pending ? 'Creating…' : invite ? 'Make another link' : 'Create an invite link'}
      </Button>
    </div>
  );
}
