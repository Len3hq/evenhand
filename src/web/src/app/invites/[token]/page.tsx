import type { Metadata } from 'next';
import Link from 'next/link';
import { JoinButton } from '@/components/participant/join-button';
import { Card, ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Team invite' };

/** Where an invite link lands. Anyone can see what it is for; joining needs an account. */
export default async function InvitePage({ params }: PageProps<'/invites/[token]'>) {
  const { token } = await params;

  let invite: Schemas['InvitePreviewDto'];
  try {
    invite = await apiGet<Schemas['InvitePreviewDto']>(`/api/invites/${encodeURIComponent(token)}`);
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 410
        ? `${e.message} Ask your team for a new one.`
        : e instanceof ApiError && e.status === 404
          ? 'This invite link is not valid. Check that it was copied completely.'
          : e instanceof Error
            ? e.message
            : 'The API is not reachable.';
    return <ErrorState title="This invite cannot be used" message={message} />;
  }

  const me = await currentUser();
  const here = `/invites/${encodeURIComponent(token)}`;

  return (
    <section className="mx-auto max-w-md">
      <Card>
        <p className="text-sm text-muted">You are invited to join</p>
        <h1 className="mt-1 text-2xl font-semibold">{invite.teamName}</h1>
        <p className="mt-1 text-sm text-muted">
          in {invite.eventName} · link valid until {formatUtc(invite.expiresAt)} · {invite.usesLeft}{' '}
          place{invite.usesLeft === 1 ? '' : 's'} left
        </p>
        <div className="mt-6">
          {me ? (
            <JoinButton token={token} teamName={invite.teamName} />
          ) : (
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/register?next=${encodeURIComponent(here)}`}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
              >
                Create an account to join
              </Link>
              <Link
                href={`/login?next=${encodeURIComponent(here)}`}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium"
              >
                Log in to join
              </Link>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
