import Link from 'next/link';
import { notFound } from 'next/navigation';
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
    </article>
  );
}
