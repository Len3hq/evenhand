import { firstFreeSlug, isReservedSlug, SLUG_PATTERN, slugify } from './slug.js';

describe('slugify', () => {
  it.each([
    ['Spring Hack 2026', 'spring-hack-2026'],
    ['  Café  Crème!! ', 'cafe-creme'],
    ['DOGFOOD — 2026', 'dogfood-2026'],
    ['!!!', 'event'],
    ['日本語', 'event'],
  ])('%j → %j', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('caps the length without leaving a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('always produces a valid slug', () => {
    for (const name of ['x', 'A-B', '--a--', 'a_b c', '2026']) {
      expect(slugify(name)).toMatch(SLUG_PATTERN);
    }
  });
});

describe('firstFreeSlug', () => {
  it('keeps the base when it is free', () => {
    expect(firstFreeSlug('hack', new Set())).toBe('hack');
  });

  it('counts up from 2', () => {
    expect(firstFreeSlug('hack', new Set(['hack', 'hack-2']))).toBe('hack-3');
  });

  it('stays within 60 characters when a suffix is added', () => {
    const base = 'a'.repeat(60);
    const slug = firstFreeSlug(base, new Set([base]));
    expect(slug).toHaveLength(60);
    expect(slug.endsWith('-2')).toBe(true);
  });
});

describe('isReservedSlug', () => {
  it('rejects a UUID, which routes would read as an id', () => {
    expect(isReservedSlug('01a0e1a2-474e-7562-bfc4-29a9b85023c8')).toBe(true);
    expect(isReservedSlug('spring-hack')).toBe(false);
  });
});
