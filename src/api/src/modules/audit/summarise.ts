/**
 * Turns an audit row into one sentence an organiser can read without knowing the schema.
 * Pure: the caller resolves the actor's name and the target's label first.
 */

export interface Describable {
  action: string;
  before: unknown;
  after: unknown;
}

/** "Ada Okonkwo", or null for the system (seed, command line). */
type Who = string | null;

export function summarise(entry: Describable, actor: Who, target: string | null): string {
  const who = actor ?? 'The system';
  const it = target ? `"${target}"` : 'it';
  const after = asRecord(entry.after);
  const changes = changeList(entry.before, entry.after);

  switch (entry.action) {
    case 'event.created':
      return `${who} created the event ${it}`;
    case 'event.updated':
      return `${who} changed the event: ${changes}`;
    case 'organizer.added':
      return `${who} made ${it} an organiser`;
    case 'organizer.removed':
      return `${who} removed ${it} as an organiser`;
    case 'rubric.updated':
      return `${who} changed the rubric: ${rubricChanges(entry.before, entry.after)}`;
    case 'questions.updated':
      return `${who} changed the submission questions: ${questionChanges(entry.before, entry.after)}`;
    case 'judge.invited':
      return `${who} created a judge invite link (${show(after.maxUses)} use${after.maxUses === 1 ? '' : 's'}) for ${list(after.tracks)}`;
    case 'judge.joined':
      return `${who} joined as a judge for ${list(after.tracks)}`;
    case 'judge.tracks_updated':
      return `${who} changed the tracks ${it} judges: ${list(asRecord(entry.before).tracks)} → ${list(after.tracks)}${Number(after.unstartedAssignmentsRemoved ?? 0) ? `; ${show(after.unstartedAssignmentsRemoved)} unstarted assignment${after.unstartedAssignmentsRemoved === 1 ? '' : 's'} outside them removed` : ''}`;
    case 'judge.removed':
      return `${who} removed the judge ${it}`;
    case 'assignment.run': {
      const short = Number(after.shortfalls ?? 0);
      return `${who} ran assignment (${show(after.target)} reviews per project, seed ${show(after.seed)}): ${show(after.added)} new assignment${after.added === 1 ? '' : 's'}${short ? `; ${short} project${short === 1 ? '' : 's'} cannot reach the target` : ''}`;
    }
    case 'review.started':
      return `${who} started reviewing ${it}`;
    case 'review.submitted':
      return `${who} submitted a review of ${it}: ${marks(after.values)}`;
    case 'ranking.run':
      return `${who} ran a ranking: ${show(after.ranked)} projects ranked in ${show(after.tieGroups)} tie group${after.tieGroups === 1 ? '' : 's'}${Number(after.listed) ? `, ${show(after.listed)} listed without a rank` : ''} (λ_b ${show(after.lambdaB)}, λ_q ${show(after.lambdaQ)})`;
    case 'ranking.published':
      return `${who} published the results (inputs ${String(after.inputsHash).slice(0, 12)}…, result ${String(after.outputHash).slice(0, 12)}…)`;
    case 'request.rate_limited':
      return `Too many requests (${str(after.limit)} limit, ${show(after.perMinute)} a minute): refused ${str(after.method)} ${str(after.path)}`;
    case 'track.created':
      return `${who} added the track ${it}`;
    case 'track.updated':
      return `${who} renamed a track: ${changes}`;
    case 'track.deleted':
      return `${who} removed the track ${it}`;
    case 'prize.created':
      return `${who} added the prize ${it}`;
    case 'prize.updated':
      return `${who} changed the prize ${it}: ${changes}`;
    case 'prize.deleted':
      return `${who} removed the prize ${it}`;
    case 'team.created':
      return `${who} created the team ${it}`;
    case 'team.joined':
      return `${who} joined the team ${it} with an invite link`;
    case 'invite.created':
      return `${who} created an invite link for the team ${it}`;
    case 'submission.created':
      return `${who} started the submission ${it}`;
    case 'submission.updated':
      return `${who} edited the submission ${it}: ${changes}`;
    case 'submission.submitted':
      return `${who} submitted ${it}`;
    case 'duplicate.flagged':
      return `${who} flagged a suspected duplicate: ${str(after.superseded)} and ${str(after.kept)} (${str(after.reason)})`;
    case 'duplicate.confirmed':
      return `${who} confirmed a duplicate: kept ${str(after.kept)}, replaced ${str(after.superseded)}; reviews moved across: ${names(after.moved)}; set aside (judge reviewed both): ${names(after.setAside)}`;
    case 'duplicate.dismissed':
      return `${who} dismissed a suspected duplicate: ${str(after.superseded)} and ${str(after.kept)} are different projects`;
    case 'duplicate.reopened':
      return `${who} reopened the duplicate ${str(after.superseded)} / ${str(after.kept)}; it is pending again`;
    case 'submission.disqualified':
      return `${who} disqualified ${it}: ${str(after.reason)}`;
    case 'submission.reinstated':
      return `${who} reinstated ${it}`;
    case 'submission.image_added':
      return `${who} added an image to ${it}`;
    case 'submission.image_removed':
      return `${who} removed an image from ${it}`;
    case 'submission.images_reordered':
      return `${who} reordered the images of ${it}`;
    case 'comment.posted':
      return `${who} commented on ${it}`;
    case 'comment.hidden':
      return `${who} hid a comment on ${it}: ${str(after.reason)}`;
    case 'comment.restored':
      return `${who} restored a hidden comment on ${it}`;
    case 'voting.configured':
      return `${who} set up the community vote: ${changes}`;
    case 'voting.passes_issued':
      return `${who} made ${show(after.count)} personal voting link(s)`;
    case 'voting.link_created':
      return `${who} made a new open voting link (any earlier one stops working)`;
    case 'voting.link_used':
      return `Someone took a personal voting link from the open link`;
    case 'voting.results_published':
      return `${who} published the community vote results`;
    case 'vote.cast':
      return `${actor ? who : 'A voter'} voted for ${it}`;
    case 'vote.withdrawn':
      return `${actor ? who : 'A voter'} withdrew their vote for ${it}`;
    case 'fixtures.imported':
      return `${who} imported the event from fixtures.json`;
    case 'demo.seeded':
      return `${who} created the demo event and test accounts`;
    case 'auth.login':
      return `${who} logged in`;
    case 'auth.login_failed':
      return `Failed login for ${str(after.email)}`;
    case 'auth.logout':
      return `${who} logged out`;
    case 'auth.registered':
      return `${who} created an account`;
    case 'user.admin_granted':
      return `${who} made ${it} a platform admin`;
    case 'user.password_reset':
      return `${who} reset the password of ${it}`;
    case 'token.created':
      return `${who} issued an API token "${str(after.label)}" for ${it}`;
    case 'token.revoked':
      return `${who} revoked the API token "${str(after.label)}" of ${it}`;
    default:
      return `${who}: ${entry.action}`;
  }
}

/** The rubric is stored keyed by criterion: say what was added, removed and re-weighted. */
function rubricChanges(before: unknown, after: unknown): string {
  const b = asRecord(before);
  const a = asRecord(after);
  const parts: string[] = [];
  for (const [key, value] of Object.entries(a)) {
    const n = asRecord(value);
    const o = b[key] ? asRecord(b[key]) : null;
    if (!o) {
      parts.push(
        `added ${show(n.label)} (weight ${show(n.weight)}, ${show(n.min)}–${show(n.max)})`,
      );
      continue;
    }
    const changed = ['label', 'weight', 'min', 'max'].filter((f) => o[f] !== n[f]);
    if (changed.length) {
      parts.push(
        `${show(o.label)} ${changed.map((f) => `${f} ${show(o[f])} → ${show(n[f])}`).join(', ')}`,
      );
    }
  }
  for (const [key, value] of Object.entries(b)) {
    if (!(key in a)) parts.push(`removed ${show(asRecord(value).label)}`);
  }
  return parts.length ? parts.join('; ') : 'reordered the criteria';
}

/** Questions are stored keyed by id: say what was added, removed, reworded or re-flagged. */
function questionChanges(before: unknown, after: unknown): string {
  const b = asRecord(before);
  const a = asRecord(after);
  const flags = (q: Record<string, unknown>): string =>
    `${q.required ? 'required' : 'optional'}, ${q.isPublic ? 'public' : 'private'}`;
  const parts: string[] = [];
  for (const [id, value] of Object.entries(a)) {
    const n = asRecord(value);
    const o = b[id] ? asRecord(b[id]) : null;
    if (!o) {
      parts.push(`added ${show(n.prompt)} (${flags(n)})`);
      continue;
    }
    const changed: string[] = [];
    if (o.prompt !== n.prompt) changed.push(`reworded to ${show(n.prompt)}`);
    if (o.required !== n.required) changed.push(n.required ? 'now required' : 'now optional');
    if (o.isPublic !== n.isPublic) changed.push(n.isPublic ? 'now public' : 'now private');
    if (changed.length) parts.push(`${show(o.prompt)} ${changed.join(', ')}`);
  }
  for (const [id, value] of Object.entries(b)) {
    if (!(id in a)) parts.push(`removed ${show(asRecord(value).prompt)}`);
  }
  return parts.length ? parts.join('; ') : 'reordered the questions';
}

/** `field: before → after; …` for the keys present in `after`. */
function changeList(before: unknown, after: unknown): string {
  const b = asRecord(before);
  const a = asRecord(after);
  const keys = Object.keys(a);
  if (!keys.length) return 'no details recorded';
  return keys.map((k) => `${k}: ${show(b[k])} → ${show(a[k])}`).join('; ');
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const MAX_SHOWN = 60;

/** A value as a short, readable token: dates as "2026-12-01 18:00 UTC", long text cut. */
function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(empty)';
  if (Array.isArray(v)) return v.length ? v.map(show).join(', ') : '(none)';
  if (typeof v === 'string') {
    if (ISO.test(v)) return `${v.slice(0, 10)} ${v.slice(11, 16)} UTC`;
    const oneLine = v.replace(/\s+/g, ' ');
    return oneLine.length > MAX_SHOWN ? `"${oneLine.slice(0, MAX_SHOWN - 1)}…"` : `"${oneLine}"`;
  }
  return String(v);
}

/** "functionality 4, quality 3". */
const marks = (v: unknown): string =>
  Object.entries(asRecord(v))
    .map(([k, x]) => `${k} ${show(x)}`)
    .join(', ') || 'no marks';

/** "Games, Tools", or "no tracks". */
const list = (v: unknown): string =>
  Array.isArray(v) && v.length ? v.map(String).join(', ') : 'no tracks';

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? '?'));

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** "Ada, Ben", or "none". */
function names(v: unknown): string {
  return Array.isArray(v) && v.length ? v.map(String).join(', ') : 'none';
}
