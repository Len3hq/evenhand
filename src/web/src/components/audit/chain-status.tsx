import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';

/**
 * The audit log's tamper check (GET /api/audit/verify), shown above a trail. The database
 * hash-chains every entry; this says whether the chain still holds, and gives the head hash to
 * note down: comparing it later is what reveals entries cut off the end.
 */
export async function ChainStatus() {
  let chain: Schemas['AuditChainDto'];
  try {
    chain = await apiGet<Schemas['AuditChainDto']>('/api/audit/verify');
  } catch (e) {
    // Not an organiser anywhere (403) or the API is down: the trail itself reports the problem.
    if (e instanceof ApiError) return null;
    throw e;
  }
  const short = `${chain.head.slice(0, 12)}…${chain.head.slice(-8)}`;
  if (chain.intact) {
    return (
      <p className="mt-3 rounded-lg border border-success p-3 text-sm" role="status">
        <span className="font-medium text-success">Tamper check passed.</span> All {chain.entries}{' '}
        audit entries are hash-chained and unchanged.{' '}
        <span className="text-muted">
          Head{' '}
          <code className="font-mono" title={chain.head}>
            {short}
          </code>{' '}
          · note it down to detect later removals.
        </span>
      </p>
    );
  }
  const problems = [
    chain.alteredCount &&
      `${chain.alteredCount} entr${chain.alteredCount === 1 ? 'y' : 'ies'} edited`,
    chain.brokenCount &&
      `${chain.brokenCount} link${chain.brokenCount === 1 ? '' : 's'} broken (entries deleted)`,
    !chain.headMatches && 'the newest entries were removed',
    chain.linked < chain.entries && `${chain.entries - chain.linked} entries unreachable`,
  ].filter(Boolean);
  return (
    <div className="mt-3 rounded-lg border border-danger p-3 text-sm" role="alert">
      <p className="font-medium text-danger">Tamper check failed: {problems.join('; ')}.</p>
      {chain.altered.length || chain.broken.length ? (
        <p className="mt-1 font-mono text-xs">
          {chain.altered.length ? `edited: ${chain.altered.join(', ')}` : ''}
          {chain.altered.length && chain.broken.length ? ' · ' : ''}
          {chain.broken.length ? `after a gap: ${chain.broken.join(', ')}` : ''}
        </p>
      ) : null}
      <p className="mt-1 text-muted">
        The audit log was changed outside Evenhand (directly in the database). Treat the trail and
        anything decided since as suspect, and restore the database from a backup.
      </p>
    </div>
  );
}
