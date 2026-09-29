'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, ErrorState, Input, Label } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import { returnPath } from '@/lib/return-path';

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
    <section className="mx-auto max-w-md pt-4">
      <h1 className="text-3xl font-bold tracking-tight">Log in</h1>
      <p className="mt-1 text-sm text-muted">
        Demo accounts are printed by <code>docker compose up</code> (password{' '}
        <code>evenhand-demo</code>).
      </p>
      <form
        onSubmit={onSubmit}
        className="mt-6 space-y-4 rounded-xl border border-border bg-surface p-5 shadow-sm"
      >
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
      <p className="mt-4 text-sm text-muted">
        New here?{' '}
        <Link
          href="/register"
          className="underline"
          // Keep ?next= so registering also returns to the page that sent you here.
          onClick={(e) => {
            e.preventDefault();
            router.push(`/register${window.location.search}`);
          }}
        >
          Create an account
        </Link>
      </p>
    </section>
  );
}
