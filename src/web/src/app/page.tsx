import { ButtonLink, Eyebrow } from '@/components/ui';
import { currentUser } from '@/lib/session';

/** How an event moves through the portal: a real sequence, so it is numbered. */
const STAGES = [
  {
    title: 'Submit',
    text: 'Teams form by invite link, draft in private and submit before a deadline the server enforces.',
  },
  {
    title: 'Assign',
    text: 'Each project goes to judges who cover its track and have no conflict with its team.',
  },
  {
    title: 'Judge',
    text: 'Judges score against a weighted rubric and never see each other’s scores.',
  },
  {
    title: 'Publish',
    text: 'Rankings are corrected for harsh and generous judges, with uncertainty and a receipt.',
  },
] as const;

const FACTS = [
  [
    'Enforced by the API',
    'Every permission is checked on the server. A judge cannot read another judge’s scores, even with curl.',
  ],
  [
    'Results you can check',
    'Each ranking records hashes of its inputs and result, its tie groups and a reason per project.',
  ],
  [
    'Runs offline',
    'One docker compose up on your own machine: no accounts, no hosted services, no network needed.',
  ],
] as const;

export default async function Home() {
  const me = await currentUser();
  return (
    <div className="space-y-16 pb-8">
      <section className="max-w-3xl space-y-5 pt-6">
        <Eyebrow>Self-hosted hackathon judging</Eyebrow>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
          Judging you can check.
        </h1>
        <p className="max-w-2xl text-lg text-muted">
          Evenhand runs a hackathon from submission to results: teams submit, judges score against a
          weighted rubric they cannot see past, and organisers publish rankings corrected for harsh
          and generous judges, with every step in an audit log.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <ButtonLink href="/projects">Browse the gallery</ButtonLink>
          {me ? (
            <ButtonLink href="/teams" variant="secondary">
              Your teams
            </ButtonLink>
          ) : (
            <ButtonLink href="/register" variant="secondary">
              Create an account
            </ButtonLink>
          )}
        </div>
      </section>

      <section aria-labelledby="how-it-works" className="space-y-4">
        <h2 id="how-it-works" className="text-xl font-semibold">
          How an event runs
        </h2>
        {/* 1px gaps over the border colour draw the dividers at every width. */}
        <ol className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((s, i) => (
            <li key={s.title} className="space-y-2 bg-surface p-5">
              <p className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</p>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-label="Why Evenhand" className="grid gap-8 sm:grid-cols-3">
        {FACTS.map(([title, text]) => (
          <div key={title} className="space-y-1.5 border-l-2 border-accent pl-4">
            <h2 className="font-semibold">{title}</h2>
            <p className="text-sm text-muted">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
