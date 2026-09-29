import type { Metadata } from 'next';
import Link from 'next/link';
import { Eyebrow, ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Community vote' };

export default async function VoteResultsPage({ params }: PageProps<'/events/[ref]/vote/results'>) {
  const { ref } = await params;

  let data: Schemas['PublicVotingResultsDto'];
  try {
    data = await apiGet<Schemas['PublicVotingResultsDto']>(
      `/api/events/${encodeURIComponent(ref)}/votes/results`,
    );
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 404
        ? 'The organisers have not published the community vote for this event.'
        : e instanceof Error
          ? e.message
          : 'The API is not reachable.';
    return <ErrorState title="Not published" message={message} />;
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <Eyebrow>Community vote</Eyebrow>
        <h1 className="text-2xl font-semibold">{data.eventName}</h1>
        <p className="text-sm text-muted">
          {data.ballots} voter{data.ballots === 1 ? '' : 's'} · voting closed{' '}
          {formatUtc(data.closedAt)} · published {formatUtc(data.publishedAt)}. A people’s choice:
          separate from the judged ranking.
        </p>
      </div>
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
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.projectId} className="border-b border-border last:border-0">
              <td className="py-2 pr-2">
                <Link href={`/projects/${r.projectId}`} className="font-medium hover:underline">
                  {r.title}
                </Link>
              </td>
              <td className="py-2 pr-2 text-muted">{r.teamName}</td>
              <td className="py-2 text-right font-mono">{r.votes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
