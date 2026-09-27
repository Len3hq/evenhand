import type { Metadata } from 'next';
import Link from 'next/link';
import { ProgressBoard } from '@/components/organizer/progress-board';
import { ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';
import { requireLogin } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Judging progress' };

export default async function ProgressPage({
  params,
}: PageProps<'/organizer/events/[ref]/progress'>) {
  const { ref } = await params;
  await requireLogin(`/organizer/events/${ref}/progress`);

  let event: Schemas['EventDto'];
  let progress: Schemas['ProgressDto'];
  try {
    event = await apiGet<Schemas['EventDto']>(`/api/events/${encodeURIComponent(ref)}`);
    progress = await apiGet<Schemas['ProgressDto']>(`/api/events/${event.id}/progress`);
  } catch (e) {
    const message =
      e instanceof ApiError && e.status === 403
        ? 'Only the event’s organisers and admins can see judging progress.'
        : e instanceof ApiError && e.status === 404
          ? 'There is no such event.'
          : e instanceof Error
            ? e.message
            : 'The API is not reachable.';
    return <ErrorState title="Progress is not available" message={message} />;
  }

  return (
    <section className="space-y-4">
      <Link href={`/organizer/events/${event.slug}`} className="text-sm text-muted">
        ← {event.name}
      </Link>
      <h1 className="text-2xl font-semibold">Judging progress</h1>
      <ProgressBoard eventId={event.id} initial={progress} />
    </section>
  );
}
