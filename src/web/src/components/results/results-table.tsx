import type { Schemas } from '@/lib/api/types';

type Row = Schemas['RankingRowDto'];

/**
 * A ranking as a table. Tie groups are shaded alternately and labelled: projects in one group
 * cannot be told apart by the data, so their order inside it should not be read as a result.
 */
export function ResultsTable({ rows, showReasons }: { rows: Row[]; showReasons: boolean }) {
  const ranked = rows.filter((r) => r.rank !== null);
  const listed = rows.filter((r) => r.rank === null);
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-medium">Rank</th>
              <th className="font-medium">Group</th>
              <th className="font-medium">Project</th>
              <th className="font-medium">Track</th>
              <th className="font-medium">Reviews</th>
              <th className="font-medium">Raw mean</th>
              <th className="font-medium">Normalized</th>
              <th className="font-medium">Move</th>
              {showReasons ? <th className="font-medium">Why</th> : null}
            </tr>
          </thead>
          <tbody>
            {ranked.map((r) => (
              <tr
                key={r.projectId}
                className={`border-t border-border ${(r.tieGroup ?? 0) % 2 ? '' : 'bg-bg'}`}
              >
                <td className="py-1 tabular-nums">{r.rank}</td>
                <td className="tabular-nums text-muted">{r.tieGroup}</td>
                <td>
                  {r.title} <span className="text-muted">· {r.teamName}</span>
                </td>
                <td className="text-muted">{r.track ?? '—'}</td>
                <td className="tabular-nums">{r.reviews}</td>
                <td className="tabular-nums">{r.rawMean.toFixed(2)}</td>
                <td className="tabular-nums">
                  {r.normalized.toFixed(2)} <span className="text-muted">± {r.sd.toFixed(2)}</span>
                </td>
                <td className="tabular-nums">
                  {r.move ? (r.move > 0 ? `▲${r.move}` : `▼${-r.move}`) : '·'}
                </td>
                {showReasons ? <td className="text-muted">{r.reason}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {listed.length ? (
        <div className="text-sm">
          <p className="font-medium">Not ranked (too few reviews)</p>
          <ul className="list-disc pl-5 text-muted">
            {listed.map((r) => (
              <li key={r.projectId}>
                {r.title} · {r.teamName}: {r.reviews} review{r.reviews === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
