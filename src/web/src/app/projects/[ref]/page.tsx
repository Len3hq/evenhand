import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Answers } from '@/components/gallery/answers';
import { ProjectImages } from '@/components/gallery/project-images';
import { Badge, Card, ErrorState, ProjectTile } from '@/components/ui';
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

  // The rubric and the event are public: show how this project is judged and where it was
  // entered (nothing for either if it cannot be loaded).
  const [rubric, event] = await Promise.all([
    apiGet<Schemas['RubricDto']>(`/api/events/${project.eventId}/criteria`).catch(() => null),
    apiGet<Schemas['EventDto']>(`/api/events/${project.eventId}`).catch(() => null),
  ]);

  const links = [
    ['Repository', project.repoUrl],
    ['Demo video', project.demoVideoUrl],
    ['Live site', project.liveUrl],
  ] as const;
  const present = links.filter(([, url]) => url);

  return (
    <article className="space-y-6">
      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-x-2 text-sm text-muted"
      >
        <Link href="/projects" className="hover:text-fg">
          ← Gallery
        </Link>
        {event ? (
          <>
            <span aria-hidden="true">/</span>
            <Link href={`/projects?event=${event.slug}`} className="hover:text-fg">
              {event.name}
            </Link>
          </>
        ) : null}
      </nav>
      <header className="flex items-start gap-4">
        {/* The initials tile stands in for a cover image; with images, the cover shows below. */}
        {project.images.length ? null : <ProjectTile title={project.title} size="lg" />}
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-balance">{project.title}</h1>
          {project.tagline ? <p className="mt-1 text-lg text-muted">{project.tagline}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {project.track ? <Badge tone="accent">{project.track.name}</Badge> : null}
            <Badge>Team {project.teamName}</Badge>
            {project.techTags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_21rem]">
        <div className="max-w-3xl">
          <ProjectImages title={project.title} images={project.images} className="mb-6" />
          {project.summary ? <p className="text-lg">{project.summary}</p> : null}
          {project.description ? (
            <p className="mt-4 whitespace-pre-line">{project.description}</p>
          ) : null}
          <Answers answers={project.answers} className="mt-6 border-t border-border pt-4" />
        </div>

        <aside className="space-y-4">
          {/* Only once the organisers publish: results are hidden until then. */}
          {event?.resultsPublishedAt ? (
            <Card className="border-accent/40">
              <p className="text-sm">Results for {event.name} are published.</p>
              <Link
                href={`/events/${event.slug}/results`}
                className="mt-2 inline-block text-sm font-medium text-accent underline underline-offset-4"
              >
                See the ranking →
              </Link>
            </Card>
          ) : null}
          {present.length ? (
            <Card>
              <ul className="space-y-2 text-sm">
                {present.map(([label, url]) => (
                  <li key={label}>
                    {/* rel=noopener noreferrer: links are user-supplied. */}
                    <a
                      href={url!}
                      className="block rounded-md border border-border px-3 py-2 font-medium hover:bg-bg"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {label} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {rubric && rubric.criteria.length ? (
            <Card>
              <h2 className="text-sm font-semibold">Judged on</h2>
              <ul className="mt-3 space-y-3 text-sm text-muted">
                {rubric.criteria.map((c) => (
                  <li key={c.key}>
                    <span>
                      {c.label}: {Math.round(c.share * 100)}% of the score, marked {c.min}–{c.max}
                    </span>
                    <div className="mt-1 h-1.5 overflow-hidden rounded bg-bg" aria-hidden="true">
                      <div
                        className="h-full rounded bg-accent"
                        style={{ width: `${Math.round(c.share * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
