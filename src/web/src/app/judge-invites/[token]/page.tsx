import type { Metadata } from 'next';
import Link from 'next/link';
import { AcceptJudgeInvite } from '@/components/participant/accept-judge-invite';
import { Card, ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Judge invitation' };

/** Where a judge invite link lands. Anyone can see what it is for; accepting needs an account. */
export default async function JudgeInvitePage({ params }: PageProps<'/judge-invites/[token]'>) {
  const { token } = await params;

  let invite: Schemas['JudgeInvitePreviewDto'];
  try {
    invite = await apiGet<Schemas['JudgeInvitePreviewDto']>(
      `/api/judge-invites/${encodeURIComponent(token)}`,
    );
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 410
        ? `${e.message} Ask the organisers for a new one.`
        : e instanceof ApiError && e.status === 404
          ? 'This invite link is not valid. Check that it was copied completely.'
          : e instanceof Error
            ? e.message
            : 'The API is not reachable.';
    return <ErrorState title="This invitation cannot be used" message={message} />;
  }

  const me = await currentUser();
  const here = `/judge-invites/${encodeURIComponent(token)}`;

  return (
    <section className="mx-auto max-w-md">
      <Card>
        <p className="text-sm text-muted">You are invited to judge</p>
        <h1 className="mt-1 text-2xl font-semibold">{invite.eventName}</h1>
        <p className="mt-2 text-sm">
          {invite.tracks.length ? `Tracks: ${invite.tracks.join(', ')}` : 'All projects'}
        </p>
        <p className="mt-1 text-xs text-muted">
          Link valid until {formatUtc(invite.expiresAt)} · {invite.usesLeft} place
          {invite.usesLeft === 1 ? '' : 's'} left. Judges cannot be on a team in the event.
        </p>
        <div className="mt-6">
          {me ? (
            <AcceptJudgeInvite token={token} eventName={invite.eventName} />
          ) : (
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/register?next=${encodeURIComponent(here)}`}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
              >
                Create an account to accept
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(here)}`}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium"
              >
                Log in to accept
              </Link>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
