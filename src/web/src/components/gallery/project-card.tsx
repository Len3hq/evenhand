import Link from 'next/link';
import { Badge, Card } from '@/components/ui';
import type { Schemas } from '@/lib/api/types';

export function ProjectCard({ project }: { project: Schemas['ProjectSummaryDto'] }) {
  const ref = project.externalId ?? project.id;
  return (
    <Card className="flex h-full flex-col">
      <h2 className="font-semibold">
        <Link href={`/projects/${encodeURIComponent(ref)}`} className="hover:underline">
          {project.title}
        </Link>
      </h2>
      <p className="mt-1 text-sm text-muted">
        {project.tagline ?? project.summary ?? 'No summary yet.'}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        {project.track ? <Badge>{project.track.name}</Badge> : null}
        <Badge>{project.teamName}</Badge>
        {project.techTags.map((t) => (
          <Badge key={t}>{t}</Badge>
        ))}
      </div>
    </Card>
  );
}
