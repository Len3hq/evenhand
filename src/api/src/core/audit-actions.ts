/**
 * Every audit action, as `domain.verb`. The audit page and exports group by these strings,
 * so add new ones here (one line each, in your own PR) rather than inventing them inline.
 */
export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.registered',
  'fixtures.imported',
  'demo.seeded',
  'submission.created',
  'submission.updated',
  'duplicate.flagged',
  'user.admin_granted',
  'user.password_reset',
  'event.created',
  'event.updated',
  'track.created',
  'track.updated',
  'track.deleted',
  'prize.created',
  'prize.updated',
  'prize.deleted',
  'team.created',
  'team.joined',
  'invite.created',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
