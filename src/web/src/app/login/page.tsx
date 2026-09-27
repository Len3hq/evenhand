'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, ErrorState, Input, Label } from '@/components/ui';
import { apiPost } from '@/lib/api/client';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await apiPost('/api/auth/login', {
        email: form.get('email'),
        password: form.get('password'),
      });
      router.push(returnPath() ?? '/projects');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <p className="mt-1 text-sm text-muted">
        Demo accounts are printed by <code>docker compose up</code> (password{' '}
        <code>evenhand-demo</code>).
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {error ? <ErrorState title="Could not log in" message={error} /> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </section>
  );
}

/**
 * Where to go after logging in: the `?next=` path a page sent us here with. Only a path on
 * this site is accepted ("/x", not "//evil.test" or "https://…"), so the login page cannot be
 * used to send someone to another site.
 */
function returnPath(): string | null {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\')
    ? next
    : null;
}
