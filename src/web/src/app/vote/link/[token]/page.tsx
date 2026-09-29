import type { Metadata } from 'next';
import { TakePass } from '@/components/voting/take-pass';

export const metadata: Metadata = { title: 'Community vote', robots: { index: false } };

export default async function SharedLinkPage({ params }: PageProps<'/vote/link/[token]'>) {
  const { token } = await params;
  return (
    <section className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Community vote</h1>
      <p className="text-sm text-muted">
        You have been invited to vote for your favourite projects. You get a ballot of your own, at
        a personal address: keep it to come back and change your votes while voting is open.
        Following this link again in the same browser brings you back to the same ballot.
      </p>
      <TakePass linkToken={token} />
    </section>
  );
}
