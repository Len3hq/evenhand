'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Card, ErrorState } from '@/components/ui';
import type { Schemas } from '@/lib/api/types';
import { formatUtc } from '@/lib/dates';

type Progress = Schemas['ProgressDto'];

const REFRESH_MS = 10_000;

/**
 * Judging progress, refreshed every 10 seconds while the tab is visible. Starts from what the
 * server rendered, so it shows data at once and works without waiting for the first poll.
 */
export function ProgressBoard({ eventId, initial }: { eventId: string; initial: Progress }) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/progress`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`The dashboard could not refresh (${res.status}).`);
      setData((await res.json()) as Progress);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The dashboard could not refresh.');
    }
  }, [eventId]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, REFRESH_MS);
    const onShow = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [refresh]);

  const t = data.totals;
  const judges = [...data.judges].sort(
    (a, b) =>
      Number(b.assigned > 0 && b.notStarted === b.assigned) -
        Number(a.assigned > 0 && a.notStarted === a.assigned) ||
      a.finished / (a.assigned || 1) - b.finished / (b.assigned || 1) ||
      (a.name < b.name ? -1 : 1),
  );
  const projects = [...data.projects].sort(
    (a, b) => a.finished - b.finished || (a.title < b.title ? -1 : 1),
  );
  const pct = t.assignments ? Math.round((t.finished / t.assignments) * 100) : 0;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted" role="status">
        Updated <span id="progress-updated">{data.generatedAt.slice(11, 19)} UTC</span> · refreshes
        every 10 seconds
        {data.judgingClose ? ` · judging closes ${formatUtc(data.judgingClose)}` : ''}
      </p>
      {error ? <ErrorState title="Not refreshed" message={error} /> : null}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Reviews submitted', `${t.finished} of ${t.assignments}`, `${pct}%`],
          ['Drafts in progress', String(t.drafts), ''],
          ['Judges not started', `${t.judgesNotStarted} of ${t.judges}`, ''],
          ['Projects with no review', `${t.projectsUnreviewed} of ${t.projects}`, ''],
        ].map(([label, value, note]) => (
          <Card key={label}>
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
            {note ? <p className="text-xs text-muted">{note}</p> : null}
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Judges</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-medium">Judge</th>
              <th className="font-medium">Tracks</th>
              <th className="font-medium">Submitted</th>
              <th className="font-medium">Drafts</th>
              <th className="font-medium">Not started</th>
              <th className="font-medium">Last active</th>
            </tr>
          </thead>
          <tbody>
            {judges.map((j) => (
              <tr key={j.judgeId} className="border-t border-border">
                <td className="py-1">
                  {j.name}{' '}
                  {j.flat ? (
                    <span title="This judge gave every project exactly the same marks, so their marks do not tell projects apart.">
                      <Badge tone="warning">same marks for every project</Badge>
                    </span>
                  ) : null}
                </td>
                <td className="text-muted">{j.tracks.join(', ') || '—'}</td>
                <td className="tabular-nums">
                  {j.finished} / {j.assigned}
                </td>
                <td className="tabular-nums">{j.drafts}</td>
                <td className="tabular-nums">{j.notStarted}</td>
                <td className="text-muted">
                  {j.lastActivity ? formatUtc(j.lastActivity) : 'not yet'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Projects</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-medium">Project</th>
              <th className="font-medium">Track</th>
              <th className="font-medium">Reviews submitted</th>
              <th className="font-medium">Drafts</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.projectId} className="border-t border-border">
                <td className="py-1">{p.title}</td>
                <td className="text-muted">{p.track ?? '—'}</td>
                <td className="tabular-nums">
                  {p.finished} / {p.assigned}
                </td>
                <td className="tabular-nums">{p.drafts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
