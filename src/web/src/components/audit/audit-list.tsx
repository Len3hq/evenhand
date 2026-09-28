import Link from 'next/link';
import { Card, EmptyState } from '@/components/ui';
import { formatUtc } from '@/lib/dates';

interface Entry {
  id: string;
  at: string;
  action: string;
  summary: string;
  /** Only the platform trail (admins) carries the client address. */
  ip?: string | null;
}

/**
 * An audit trail as a list of sentences, newest first, with paging. Shared by the event trail
 * (organisers) and the platform trail (admins), so both read the same way.
 */
export function AuditList({
  items,
  page,
  pages,
  pageHref,
  emptyHint,
}: {
  items: Entry[];
  page: number;
  pages: number;
  pageHref: (n: number) => string;
  emptyHint: string;
}) {
  return (
    <>
      <div className="mt-6">
        {items.length === 0 ? (
          <EmptyState title="Nothing matches">{emptyHint}</EmptyState>
        ) : (
          <ol className="space-y-2">
            {items.map((e) => (
              <li key={e.id}>
                <Card className="py-3">
                  <p className="text-sm">{e.summary}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatUtc(e.at)} · {e.action}
                    {e.ip ? ` · from ${e.ip}` : ''}
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </div>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex items-center gap-4 text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)}>← Newer</Link> : null}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={pageHref(page + 1)}>Older →</Link> : null}
        </nav>
      ) : null}
    </>
  );
}
