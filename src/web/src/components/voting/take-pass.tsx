'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorState } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

/**
 * The shared voting link's page: one click makes a personal voting link and opens it. A click,
 * not a page load, so link previews and prefetching never make ballots. A browser that already
 * took a ballot is given the same one back (the API remembers it in a cookie).
 */
export function TakePass({ linkToken }: { linkToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function take() {
    setBusy(true);
    setError(null);
    try {
      const pass = await apiPost<Schemas['TakenPassDto']>(
        `/api/voting/links/${encodeURIComponent(linkToken)}/passes`,
      );
      router.push(`/vote/${pass.token}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button type="button" onClick={() => void take()} disabled={busy}>
        {busy ? 'Opening…' : 'Get my ballot'}
      </Button>
      {error ? <ErrorState title="No ballot" message={error} /> : null}
    </div>
  );
}
