import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectCard } from '@/components/gallery/project-card';
import { Button, EmptyState, ErrorState, Input } from '@/components/ui';
import { ApiError, apiGet } from '@/lib/api/server';
import type { Schemas } from '@/lib/api/types';

// Always render at request time: the gallery changes as teams submit, and `next build`
// must not need the API.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Gallery' };

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export default async function GalleryPage({ searchParams }: PageProps<'/projects'>) {
  const sp = await searchParams;
  const q = first(sp.q)?.trim() ?? '';
  const tag = first(sp.tag) ?? '';
  const page = Math.max(1, Number(first(sp.page)) || 1);

  const query = new URLSearchParams({ page: String(page) });
  if (q) query.set('q', q);
  if (tag) query.set('tag', tag);

  let data: Schemas['ProjectPageDto'];
  try {
    data = await apiGet<Schemas['ProjectPageDto']>(`/api/projects?${query.toString()}`);
  } catch (e) {
    return (
      <ErrorState
        title="The gallery could not be loaded"
        message={e instanceof ApiError ? e.message : 'The API is not reachable. Is it running?'}
      />
    );
  }

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const pageHref = (n: number): string => {
    const p = new URLSearchParams(query);
    p.set('page', String(n));
    return `/projects?${p.toString()}`;
  };

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Gallery</h1>
          <p className="text-sm text-muted">
            {data.total} project{data.total === 1 ? '' : 's'}
            {q ? ` matching “${q}”` : ''}
          </p>
        </div>
        <form action="/projects" method="get" role="search" className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Search projects
          </label>
          <Input id="q" name="q" type="search" defaultValue={q} placeholder="Search projects" />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      {data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No projects found">
            {q ? (
              <Link href="/projects" className="underline">
                Clear the search
              </Link>
            ) : (
              'Projects appear here once teams submit them.'
            )}
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} />
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-6 flex items-center gap-4 text-sm">
          {page > 1 ? <Link href={pageHref(page - 1)}>← Previous</Link> : null}
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={pageHref(page + 1)}>Next →</Link> : null}
        </nav>
      ) : null}
    </section>
  );
}
