'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorState } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import type { Schemas } from '@/lib/api/types';

export function JoinButton({ token, teamName }: { token: string; teamName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function join() {
    setPending(true);
    setError(null);
    try {
      const team = await apiPost<Schemas['TeamDto']>(`/api/invites/${encodeURIComponent(token)}`);
      router.push(`/teams/${team.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join the team.');
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorState title="Not joined" message={error} /> : null}
      <Button type="button" onClick={join} disabled={pending}>
        {pending ? 'Joining…' : `Join ${teamName}`}
      </Button>
    </div>
  );
}
