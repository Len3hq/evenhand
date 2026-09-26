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
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
