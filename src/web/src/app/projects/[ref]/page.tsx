import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Answers } from '@/components/gallery/answers';
import { Badge, ErrorState } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: PageProps<'/projects/[ref]'>) {
  const { ref } = await params;
  let project: Schemas['ProjectDetailDto'];
  try {
    project = await apiGet<Schemas['ProjectDetailDto']>(`/api/projects/${encodeURIComponent(ref)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    return (
      <ErrorState
        title="This project could not be loaded"
        message={e instanceof Error ? e.message : ''}
      />
    );
  }

  // The rubric is public: show how this project is judged (nothing if it cannot be loaded).
  const rubric = await apiGet<Schemas['RubricDto']>(
    `/api/events/${project.eventId}/criteria`,
  ).catch(() => null);

  const links = [
    ['Repository', project.repoUrl],
    ['Demo video', project.demoVideoUrl],
    ['Live site', project.liveUrl],
  ] as const;

  return (
    <article className="max-w-3xl">
      <Link href="/projects" className="text-sm text-muted hover:text-fg">
        ← Gallery
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">{project.title}</h1>
      {project.tagline ? <p className="mt-1 text-lg text-muted">{project.tagline}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {project.track ? <Badge>{project.track.name}</Badge> : null}
        <Badge>Team {project.teamName}</Badge>
        {project.techTags.map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
      </div>
      {project.summary ? <p className="mt-6">{project.summary}</p> : null}
      {project.description ? (
        <p className="mt-4 whitespace-pre-line">{project.description}</p>
      ) : null}
      <Answers answers={project.answers} className="mt-6 border-t border-border pt-4" />
      <ul className="mt-6 space-y-1 text-sm">
        {links
          .filter(([, url]) => url)
          .map(([label, url]) => (
            <li key={label}>
              {/* rel=noopener noreferrer: links are user-supplied. */}
              <a href={url!} className="underline" rel="noopener noreferrer" target="_blank">
                {label}
              </a>
            </li>
          ))}
      </ul>
      {rubric && rubric.criteria.length ? (
        <section className="mt-8 border-t border-border pt-4">
          <h2 className="text-sm font-semibold">Judged on</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {rubric.criteria.map((c) => (
              <li key={c.key}>
                {c.label}: {Math.round(c.share * 100)}% of the score, marked {c.min}–{c.max}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
