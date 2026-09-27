import Link from 'next/link';
import { currentUser } from '@/lib/session';

export default async function Home() {
  const me = await currentUser();
  return (
    <section className="max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">Judging you can check.</h1>
      <p className="mt-4 text-muted">
        Evenhand runs a hackathon from submission to results: teams submit, judges score against a
        weighted rubric they cannot see past, and organisers publish rankings corrected for harsh
        and generous judges, with every step in an audit log.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/projects"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
        >
          Browse the gallery
        </Link>
        {me ? null : (
          <Link
            href="/register"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium"
          >
            Create an account
          </Link>
        )}
      </div>
    </section>
  );
}
