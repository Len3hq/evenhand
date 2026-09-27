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
    default:
      return `${who}: ${entry.action}`;
  }
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

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? '?'));

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
