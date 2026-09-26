/**
 * The organisers' fixtures.json shape (https://dogfoodhack.com/spec) and a strict parser.
 * The file is input, not our data model: it is validated here, then mapped onto our schema
 * by FixtureImporter. Every problem is reported at once, with its path.
 */

export interface FixtureEvent {
  id: string;
  name: string;
  submissions_close: string;
}
export interface FixtureTrack {
  id: string;
  name: string;
}
export interface FixtureJudge {
  id: string;
  name: string;
  email: string;
  tracks: string[];
}
export interface FixtureTeam {
  id: string;
  name: string;
  members: string[];
}
export interface FixtureProject {
  id: string;
  team: string;
  track: string;
  title: string;
  summary: string;
  repo_url: string;
  submitted_at: string;
}
export interface FixtureScore {
  judge: string;
  project: string;
  criteria: Record<string, number>;
  comment: string;
}
export interface FixtureFile {
  event: FixtureEvent;
  tracks: FixtureTrack[];
  judges: FixtureJudge[];
  teams: FixtureTeam[];
  projects: FixtureProject[];
  scores: FixtureScore[];
}

export class FixtureError extends Error {
  override readonly name = 'FixtureError';
  constructor(readonly problems: string[]) {
    super(`fixtures.json is invalid:\n  - ${problems.slice(0, 20).join('\n  - ')}`);
  }
}

export function parseFixtures(raw: unknown): FixtureFile {
  const problems: string[] = [];
  const obj = (v: unknown, path: string): Record<string, unknown> => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      problems.push(`${path} must be an object`);
      return {};
    }
    return v as Record<string, unknown>;
  };
  const arr = (v: unknown, path: string): unknown[] => {
    if (!Array.isArray(v)) {
      problems.push(`${path} must be an array`);
      return [];
    }
    return v;
  };
  const str = (v: unknown, path: string, allowEmpty = false): string => {
    if (typeof v !== 'string' || (!allowEmpty && v.trim() === '')) {
      problems.push(`${path} must be a${allowEmpty ? '' : ' non-empty'} string`);
      return '';
    }
    return v;
  };
  const iso = (v: unknown, path: string): string => {
    const s = str(v, path);
    if (s && Number.isNaN(Date.parse(s))) problems.push(`${path} must be an ISO 8601 timestamp`);
    return s;
  };
  const strList = (v: unknown, path: string): string[] =>
    arr(v, path).map((x, i) => str(x, `${path}[${i}]`));

  const root = obj(raw, '$');
  const e = obj(root.event, 'event');
  const event: FixtureEvent = {
    id: str(e.id, 'event.id'),
    name: str(e.name, 'event.name'),
    submissions_close: iso(e.submissions_close, 'event.submissions_close'),
  };
  const tracks = arr(root.tracks, 'tracks').map((t, i): FixtureTrack => {
    const o = obj(t, `tracks[${i}]`);
    return { id: str(o.id, `tracks[${i}].id`), name: str(o.name, `tracks[${i}].name`) };
  });
  const judges = arr(root.judges, 'judges').map((j, i): FixtureJudge => {
    const o = obj(j, `judges[${i}]`);
    return {
      id: str(o.id, `judges[${i}].id`),
      name: str(o.name, `judges[${i}].name`),
      email: str(o.email, `judges[${i}].email`).toLowerCase(),
      tracks: strList(o.tracks, `judges[${i}].tracks`),
    };
  });
  const teams = arr(root.teams, 'teams').map((t, i): FixtureTeam => {
    const o = obj(t, `teams[${i}]`);
    return {
      id: str(o.id, `teams[${i}].id`),
      name: str(o.name, `teams[${i}].name`),
      members: strList(o.members, `teams[${i}].members`).map((m) => m.toLowerCase()),
    };
  });
  const projects = arr(root.projects, 'projects').map((p, i): FixtureProject => {
    const o = obj(p, `projects[${i}]`);
    return {
      id: str(o.id, `projects[${i}].id`),
      team: str(o.team, `projects[${i}].team`),
      track: str(o.track, `projects[${i}].track`),
      title: str(o.title, `projects[${i}].title`),
      summary: str(o.summary, `projects[${i}].summary`, true),
      repo_url: str(o.repo_url, `projects[${i}].repo_url`, true),
      submitted_at: iso(o.submitted_at, `projects[${i}].submitted_at`),
    };
  });
  const scores = arr(root.scores, 'scores').map((s, i): FixtureScore => {
    const o = obj(s, `scores[${i}]`);
    const c = obj(o.criteria, `scores[${i}].criteria`);
    const criteria: Record<string, number> = {};
    for (const [k, v] of Object.entries(c)) {
      if (typeof v !== 'number' || !Number.isInteger(v)) {
        problems.push(`scores[${i}].criteria.${k} must be an integer`);
      } else {
        criteria[k] = v;
      }
    }
    return {
      judge: str(o.judge, `scores[${i}].judge`),
      project: str(o.project, `scores[${i}].project`),
      criteria,
      comment: str(o.comment ?? '', `scores[${i}].comment`, true),
    };
  });

  // Referential integrity: every id a record points at must exist.
  const ids = (list: { id: string }[]) => new Set(list.map((x) => x.id));
  const trackIds = ids(tracks);
  const teamIds = ids(teams);
  const judgeIds = ids(judges);
  const projectIds = ids(projects);
  judges.forEach((j, i) =>
    j.tracks.forEach(
      (t) => trackIds.has(t) || problems.push(`judges[${i}] refers to unknown track ${t}`),
    ),
  );
  projects.forEach((p, i) => {
    if (!teamIds.has(p.team)) problems.push(`projects[${i}] refers to unknown team ${p.team}`);
    if (!trackIds.has(p.track)) problems.push(`projects[${i}] refers to unknown track ${p.track}`);
  });
  scores.forEach((s, i) => {
    if (!judgeIds.has(s.judge)) problems.push(`scores[${i}] refers to unknown judge ${s.judge}`);
    if (!projectIds.has(s.project))
      problems.push(`scores[${i}] refers to unknown project ${s.project}`);
  });
  for (const [name, list] of [
    ['tracks', tracks],
    ['judges', judges],
    ['teams', teams],
    ['projects', projects],
  ] as const) {
    if (ids(list).size !== list.length) problems.push(`${name} contains duplicate ids`);
  }

  if (problems.length > 0) throw new FixtureError(problems);
  return { event, tracks, judges, teams, projects, scores };
}

/** Criterion keys in order of first appearance across all scores. */
export function criterionKeys(scores: readonly FixtureScore[]): string[] {
  const seen = new Set<string>();
  for (const s of scores) for (const k of Object.keys(s.criteria)) seen.add(k);
  return [...seen];
}
