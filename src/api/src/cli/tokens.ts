import type { AuditService } from '../core/audit.service.js';
import type { Clock } from '../core/clock.js';
import type { PrismaService } from '../core/prisma.service.js';
import { generateToken, hashToken } from '../core/tokens.js';

const MAX_LABEL = 80;

export interface CreatedToken {
  id: string;
  email: string;
  label: string;
  /** The secret, returned once for the operator to print; only its SHA-256 is stored. */
  token: string;
}

export interface TokenRow {
  id: string;
  email: string;
  label: string;
  isDemo: boolean;
  createdAt: Date;
  revokedAt: Date | null;
}

/**
 * A new bearer token for an existing account, for scripts and integrations. It acts with that
 * account's roles, like the account's browser session. 256 random bits, returned once; the
 * audit row carries the label, never the token or its hash.
 */
export async function createToken(
  prisma: PrismaService,
  audit: AuditService,
  rawEmail: string,
  rawLabel: string,
): Promise<CreatedToken> {
  const email = rawEmail.trim().toLowerCase();
  const label = rawLabel.trim();
  if (!label || label.length > MAX_LABEL) {
    throw new Error(`--label needs 1 to ${MAX_LABEL} characters`);
  }
  const token = generateToken();
  const row = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email } });
    if (!user) throw new Error(`no account for ${email}`);
    const created = await tx.apiToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), label },
    });
    await audit.record(tx, {
      action: 'token.created',
      targetType: 'user',
      targetId: user.id,
      after: { tokenId: created.id, label, by: 'cli tokens create' },
    });
    return created;
  });
  return { id: row.id, email, label, token };
}

/** Every token, or one account's, newest first. Never the secret or its hash. */
export async function listTokens(prisma: PrismaService, rawEmail?: string): Promise<TokenRow[]> {
  const email = rawEmail?.trim().toLowerCase();
  if (email && !(await prisma.user.findUnique({ where: { email } }))) {
    throw new Error(`no account for ${email}`);
  }
  const rows = await prisma.apiToken.findMany({
    where: email ? { user: { email } } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      label: true,
      isDemo: true,
      createdAt: true,
      revokedAt: true,
      user: { select: { email: true } },
    },
  });
  return rows.map(({ user, ...r }) => ({ ...r, email: user.email }));
}

/**
 * Revokes one token by id, or with `demo` every demo token (so a deployment that keeps
 * DEMO_MODE on for a rehearsal can still shut the public tokens). Revoking is final: the seeder
 * does not recreate a revoked demo token. Already-revoked tokens are left as they are.
 * Returns the ids revoked now.
 */
export async function revokeTokens(
  prisma: PrismaService,
  audit: AuditService,
  clock: Clock,
  target: { id: string } | { demo: true },
): Promise<string[]> {
  return prisma.$transaction(async (tx) => {
    let rows;
    if ('id' in target) {
      const row = UUID.test(target.id)
        ? await tx.apiToken.findUnique({ where: { id: target.id } })
        : null;
      if (!row) throw new Error(`no token ${target.id} (see: cli tokens list)`);
      rows = row.revokedAt ? [] : [row];
    } else {
      rows = await tx.apiToken.findMany({
        where: { isDemo: true, revokedAt: null },
        orderBy: { id: 'asc' },
      });
    }
    const now = clock.now();
    for (const row of rows) {
      await tx.apiToken.update({ where: { id: row.id }, data: { revokedAt: now } });
      await audit.record(tx, {
        action: 'token.revoked',
        targetType: 'user',
        targetId: row.userId,
        before: { tokenId: row.id, label: row.label, revokedAt: null },
        after: { tokenId: row.id, label: row.label, revokedAt: now, by: 'cli tokens revoke' },
      });
    }
    return rows.map((r) => r.id);
  });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
