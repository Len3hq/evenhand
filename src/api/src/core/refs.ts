/**
 * Route parameters accept either our internal id (a UUID) or the fixture's external id
 * (e.g. `evt_01`, `jdg_24`, `prj_07`) — BUILD-PLAN decision 50 — so `.dogfood.toml`, exports
 * and fixtures.json all line up.
 *
 * Postgres rejects a non-UUID compared against a uuid column, so the id branch is only
 * added when the reference really is a UUID.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(ref: string): boolean {
  return UUID.test(ref);
}

/** `where` fragment matching a row by id or external id. */
export function byRef(ref: string): { OR: ({ id: string } | { externalId: string })[] } {
  return { OR: isUuid(ref) ? [{ id: ref }, { externalId: ref }] : [{ externalId: ref }] };
}

/** Events can also be addressed by slug. */
export function eventByRef(ref: string): {
  OR: ({ id: string } | { externalId: string } | { slug: string })[];
} {
  return { OR: [...byRef(ref).OR, { slug: ref }] };
}
