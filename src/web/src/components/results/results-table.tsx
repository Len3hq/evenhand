import type { Schemas } from '@/lib/api/types';

type Row = Schemas['RankingRowDto'];

/**
 * A normalized score with its uncertainty, drawn on the scale shared by the whole table: the band
 * is ± one standard deviation, the dot the score. Overlapping bands are why tie groups exist.
 * Decorative (aria-hidden): the numbers sit next to it.
 */
function ScoreBar({ row, lo, hi }: { row: Row; lo: number; hi: number }) {
  const span = hi - lo || 1;
  const at = (v: number) => `${(((v - lo) / span) * 100).toFixed(2)}%`;
  return (
    <div className="relative h-3 w-28" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded bg-accent-soft"
        style={{
          left: at(row.normalized - row.sd),
          width: `${((2 * row.sd) / span) * 100}%`,
        }}
      />
      <div
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
        style={{ left: at(row.normalized) }}
      />
    </div>
  );
}

/**
 * A ranking as a table. Tie groups are shaded alternately and labelled: projects in one group
 * cannot be told apart by the data, so their order inside it should not be read as a result.
 */
export function ResultsTable({ rows, showReasons }: { rows: Row[]; showReasons: boolean }) {
  const ranked = rows.filter((r) => r.rank !== null);
  const listed = rows.filter((r) => r.rank === null);
  const lo = Math.min(...ranked.map((r) => r.normalized - r.sd));
  const hi = Math.max(...ranked.map((r) => r.normalized + r.sd));
  return (
    <div className="space-y-4">
      {ranked.length ? (
        <p className="text-xs text-muted">
          The drawing beside each score shows it as a dot and its uncertainty (± one standard
          deviation) as a band, on one scale for the whole table. Where bands overlap, the reviews
          cannot tell the projects apart.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-bg">
            <tr className="text-left text-muted">
              <th className="px-3 py-2 font-medium">Rank</th>
              <th className="px-3 py-2 font-medium">Group</th>
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Track</th>
              <th className="px-3 py-2 font-medium">Reviews</th>
              <th className="px-3 py-2 font-medium">Raw mean</th>
              <th className="px-3 py-2 font-medium">Normalized</th>
              <th className="px-3 py-2 font-medium">
                <span className="sr-only">Score and uncertainty, drawn</span>
              </th>
              <th className="px-3 py-2 font-medium">Move</th>
              {showReasons ? <th className="px-3 py-2 font-medium">Why</th> : null}
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => (
              <tr
                key={r.projectId}
                className={`${
                  // A heavier rule where a new tie group starts; groups alternate in tint.
                  i > 0 && ranked[i - 1]!.tieGroup !== r.tieGroup
                    ? 'border-t-2 border-accent/50'
                    : 'border-t border-border'
                } ${(r.tieGroup ?? 0) % 2 ? 'bg-accent-soft/40' : ''}`}
              >
                <td className="px-3 py-1.5 font-semibold tabular-nums">{r.rank}</td>
                <td className="px-3">
                  <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted">
                    G{r.tieGroup}
                  </span>
                </td>
                <td className="px-3">
                  <span className="font-medium">{r.title}</span>{' '}
                  <span className="text-muted">· {r.teamName}</span>
                </td>
                <td className="px-3 text-muted">{r.track ?? '—'}</td>
                <td className="px-3 tabular-nums">{r.reviews}</td>
                <td className="px-3 tabular-nums">{r.rawMean.toFixed(2)}</td>
                <td className="whitespace-nowrap px-3 tabular-nums">
                  {r.normalized.toFixed(2)} <span className="text-muted">± {r.sd.toFixed(2)}</span>
                </td>
                <td className="px-3">
                  <ScoreBar row={r} lo={lo} hi={hi} />
                </td>
                <td
                  className={`px-3 tabular-nums ${
                    r.move ? (r.move > 0 ? 'text-success' : 'text-warning') : 'text-muted'
                  }`}
                >
                  {r.move ? (r.move > 0 ? `▲${r.move}` : `▼${-r.move}`) : '·'}
                </td>
                {showReasons ? <td className="px-3 py-1.5 text-muted">{r.reason}</td> : null}
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
