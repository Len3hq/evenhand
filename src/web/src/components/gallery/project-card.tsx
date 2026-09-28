import Image from 'next/image';
import Link from 'next/link';
import { Badge, Card, ProjectTile } from '@/components/ui';
import type { Schemas } from '@/lib/api/types';

export function ProjectCard({ project }: { project: Schemas['ProjectSummaryDto'] }) {
  const ref = project.externalId ?? project.id;
  return (
    <Card className="relative flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-accent">
      {project.thumbnailUrl ? (
        // The team's cover image; decorative here, since the title names the project.
        <Image
          src={project.thumbnailUrl}
          alt=""
          width={640}
          height={400}
          className="-mx-4 -mt-4 mb-3 h-auto w-[calc(100%+2rem)] max-w-none border-b border-border"
        />
      ) : null}
      <div className="flex items-start gap-3">
        {project.thumbnailUrl ? null : <ProjectTile title={project.title} />}
        <div className="min-w-0">
          <h2 className="font-semibold leading-snug">
            {/* The link covers the whole card (after:inset-0), so the card is one target. */}
            <Link
              href={`/projects/${encodeURIComponent(ref)}`}
              className="after:absolute after:inset-0 after:rounded-lg hover:underline focus-visible:outline-none"
            >
              {project.title}
            </Link>
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted">Team {project.teamName}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-sm text-muted">
        {project.tagline ?? project.summary ?? 'No summary yet.'}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        {project.track ? <Badge tone="accent">{project.track.name}</Badge> : null}
        {project.techTags.map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
      </div>
    </Card>
  );
}
