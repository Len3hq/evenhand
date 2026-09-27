'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiPost } from '@/lib/api/client';

/** Ends the browser session on the server, then shows the logged-out portal. */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    setPending(true);
    try {
      await apiPost('/api/auth/logout');
    } finally {
      // Even if the session had already expired, the user wants to be logged out.
      router.push('/');
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="text-sm text-muted hover:text-fg disabled:opacity-60"
    >
      {pending ? 'Logging out…' : 'Log out'}
    </button>
  );
}
