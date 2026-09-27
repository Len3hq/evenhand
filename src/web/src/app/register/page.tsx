'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button, ErrorState, Input, Label } from '@/components/ui';
import { apiPost } from '@/lib/api/client';
import { returnPath } from '@/lib/return-path';

/** Creates an account and logs it in. Joining a team or judging comes later, by invite link. */
export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await apiPost('/api/auth/register', {
        name: form.get('name'),
        email: form.get('email'),
        password: form.get('password'),
      });
      router.push(returnPath() ?? '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account.');
      setPending(false);
    }
  }

  return (
    <section className="mx-auto max-w-sm">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <p className="mt-1 text-sm text-muted">
        Then create a team, or join one with the invite link a teammate sends you.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" autoComplete="name" required maxLength={120} />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={200}
            aria-describedby="password-help"
          />
          <p id="password-help" className="mt-1 text-xs text-muted">
            At least 10 characters.
          </p>
        </div>
        {error ? <ErrorState title="Could not create the account" message={error} /> : null}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted">
        Already have one?{' '}
        <Link
          href="/login"
          className="underline"
          onClick={(e) => {
            e.preventDefault();
            router.push(`/login${window.location.search}`);
          }}
        >
          Log in
        </Link>
      </p>
    </section>
  );
}
