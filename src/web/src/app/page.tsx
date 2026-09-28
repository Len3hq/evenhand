import Link from 'next/link';
import { Card } from '@/components/ui';
import { currentUser } from '@/lib/session';

const STEPS = [
  {
    n: '1',
    title: 'Teams submit',
    text: 'Form a team with an invite link, draft in private, and submit to the public gallery until a deadline the server enforces to the millisecond.',
  },
  {
    n: '2',
    title: 'Judges score',
    text: 'Each judge sees only the projects assigned to them and a weighted rubric. The API, not the page, keeps them out of each other’s scores.',
  },
  {
    n: '3',
    title: 'Organisers publish',
    text: 'Rankings are corrected for harsh and generous judges, with uncertainty, tie groups and a receipt that can be checked. Every step is in the audit log.',
  },
] as const;

export default async function Home() {
  const me = await currentUser();
  return (
    <div className="space-y-12">
      <section className="max-w-2xl pt-4">
        <p className="text-sm font-medium text-accent">Self-hosted hackathon judging</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Judging you can check.</h1>
        <p className="mt-4 text-lg text-muted">
          Evenhand runs a hackathon from submission to results: teams submit, judges score against a
          weighted rubric they cannot see past, and organisers publish rankings corrected for harsh
          and generous judges, with every step in an audit log.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/projects"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
          >
            Browse the gallery
          </Link>
          {me ? null : (
            <Link
              href="/register"
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-bg"
            >
              Create an account
            </Link>
          )}
        </div>
      </section>

      <section aria-label="How it works" className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <Card key={s.n}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold">
              {s.n}
            </div>
            <h2 className="mt-3 font-semibold">{s.title}</h2>
            <p className="mt-1 text-sm text-muted">{s.text}</p>
          </Card>
        ))}
      </section>

      <p className="text-sm text-muted">
        Runs from one <code className="rounded bg-surface px-1 py-0.5">docker compose up</code> with
        the network off. Everything the pages do is also in the{' '}
        <a href="/api/docs" className="underline">
          documented API
        </a>
        .
      </p>
    </div>
  );
}
