import { isUuid } from '../../core/refs.js';

const MAX_SLUG = 60;

/** Lower-case words joined by single hyphens, e.g. `spring-hack-2026`. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Spring Hack 2026!" → "spring-hack-2026". Falls back to "event" when nothing usable is left. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // accents: "Café" → "Cafe"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG)
    .replace(/-+$/, '');
  return slug || 'event';
}

/**
 * Routes accept an event's id, fixture id or slug (core/refs.ts), so a slug must not be
 * readable as either of the others. The slug pattern already rules out fixture ids (they
 * contain `_`); this rules out UUIDs.
 */
export function isReservedSlug(slug: string): boolean {
  return isUuid(slug);
}

/** The first of `base`, `base-2`, `base-3`, … that is not in `taken`. */
export function firstFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_SLUG - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
