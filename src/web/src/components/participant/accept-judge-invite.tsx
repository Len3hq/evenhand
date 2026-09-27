'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorState } from '@/components/ui';
import { apiPost } from '@/lib/api/client';

export function AcceptJudgeInvite({ token, eventName }: { token: string; eventName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function accept() {
    setPending(true);
    setError(null);
    try {
      await apiPost(`/api/judge-invites/${encodeURIComponent(token)}`);
      router.push('/judging');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept the invitation.');
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorState title="Not accepted" message={error} /> : null}
      <Button type="button" onClick={accept} disabled={pending}>
        {pending ? 'Accepting…' : `Judge ${eventName}`}
      </Button>
    </div>
  );
}
