/**
 * What an Evenhand export carries beyond the organisers' fixtures.json shape, under one
 * top-level `evenhand` key. Any importer that reads the shared shape ignores it; ours applies
 * it to the rows it creates. Everything in it is optional.
 */
export interface EventExtension {
  version: 1;
  event?: { slug?: string; opens_at?: string | null; judging_close?: string | null };
  prizes?: { name: string; description: string | null; track: string | null }[];
  criteria?: {
    key: string;
    label: string;
    weight: number;
    min: number;
    max: number;
    order: number;
  }[];
  /** Keyed by project id. Only fields that are set. */
  projects?: Record<
    string,
    {
      tagline?: string;
      description?: string;
      demo_video_url?: string;
      live_url?: string;
      tech_tags?: string[];
    }
  >;
}

export class ExtensionError extends Error {
  override readonly name = 'ExtensionError';
  constructor(readonly problems: string[]) {
    super(`the "evenhand" block is invalid:\n  - ${problems.slice(0, 20).join('\n  - ')}`);
  }
}

/**
 * Validates the `evenhand` block of a file, or returns null when there is none. `trackIds` and
 * `projectIds` are the ids the file's shared part defines, so references can be checked.
 */
export function parseExtension(
  raw: unknown,
  trackIds: ReadonlySet<string>,
  projectIds: ReadonlySet<string>,
): EventExtension | null {
  if (raw === undefined || raw === null) return null;
  const problems: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  const optStr = (v: unknown, path: string): string | undefined => {
    if (v === undefined) return undefined;
    if (typeof v !== 'string') problems.push(`${path} must be a string`);
    return typeof v === 'string' ? v : undefined;
  };
  const optDate = (v: unknown, path: string): string | null | undefined => {
    if (v === null) return null;
    const s = optStr(v, path);
    if (s !== undefined && Number.isNaN(Date.parse(s))) problems.push(`${path} must be a date`);
    return s;
  };
  const num = (v: unknown, path: string): number => {
    if (typeof v !== 'number' || !Number.isFinite(v)) problems.push(`${path} must be a number`);
    return typeof v === 'number' ? v : 0;
  };

  if (!isObj(raw)) throw new ExtensionError(['evenhand must be an object']);
  if (raw.version !== 1) problems.push('evenhand.version must be 1');
  const ext: EventExtension = { version: 1 };

  if (raw.event !== undefined) {
    if (!isObj(raw.event)) problems.push('evenhand.event must be an object');
    else {
      ext.event = {
        slug: optStr(raw.event.slug, 'evenhand.event.slug'),
        opens_at: optDate(raw.event.opens_at, 'evenhand.event.opens_at'),
        judging_close: optDate(raw.event.judging_close, 'evenhand.event.judging_close'),
      };
    }
  }

  if (raw.prizes !== undefined) {
    if (!Array.isArray(raw.prizes)) problems.push('evenhand.prizes must be an array');
    else {
      ext.prizes = raw.prizes.map((p, i) => {
        const path = `evenhand.prizes[${i}]`;
        if (!isObj(p)) {
          problems.push(`${path} must be an object`);
          return { name: '', description: null, track: null };
        }
        const name = optStr(p.name, `${path}.name`) ?? '';
        if (!name) problems.push(`${path}.name is required`);
        const track = p.track === null ? null : (optStr(p.track, `${path}.track`) ?? null);
        if (track !== null && !trackIds.has(track)) {
          problems.push(`${path} refers to unknown track ${track}`);
        }
        const description =
          p.description === null ? null : (optStr(p.description, `${path}.description`) ?? null);
        return { name, description, track };
      });
    }
  }

  if (raw.criteria !== undefined) {
    if (!Array.isArray(raw.criteria)) problems.push('evenhand.criteria must be an array');
    else {
      ext.criteria = raw.criteria.map((c, i) => {
        const path = `evenhand.criteria[${i}]`;
        const o = isObj(c) ? c : {};
        if (!isObj(c)) problems.push(`${path} must be an object`);
        const row = {
          key: optStr(o.key, `${path}.key`) ?? '',
          label: optStr(o.label, `${path}.label`) ?? '',
          weight: num(o.weight, `${path}.weight`),
          min: num(o.min, `${path}.min`),
          max: num(o.max, `${path}.max`),
          order: num(o.order, `${path}.order`),
        };
        if (!row.key) problems.push(`${path}.key is required`);
        if (row.weight < 0) problems.push(`${path}.weight must not be negative`);
        if (row.min > row.max) problems.push(`${path}.min must not exceed max`);
        return row;
      });
    }
  }

  if (raw.projects !== undefined) {
    if (!isObj(raw.projects)) problems.push('evenhand.projects must be an object');
    else {
      ext.projects = {};
      for (const [id, p] of Object.entries(raw.projects)) {
        const path = `evenhand.projects.${id}`;
        if (!projectIds.has(id)) problems.push(`${path} refers to unknown project`);
        if (!isObj(p)) {
          problems.push(`${path} must be an object`);
          continue;
        }
        let tags: string[] | undefined;
        if (p.tech_tags !== undefined) {
          if (!Array.isArray(p.tech_tags) || p.tech_tags.some((t) => typeof t !== 'string')) {
            problems.push(`${path}.tech_tags must be a list of strings`);
          } else tags = p.tech_tags as string[];
        }
        ext.projects[id] = {
          tagline: optStr(p.tagline, `${path}.tagline`),
          description: optStr(p.description, `${path}.description`),
          demo_video_url: optStr(p.demo_video_url, `${path}.demo_video_url`),
          live_url: optStr(p.live_url, `${path}.live_url`),
          tech_tags: tags,
        };
      }
    }
  }

  if (problems.length) throw new ExtensionError(problems);
  return ext;
}
