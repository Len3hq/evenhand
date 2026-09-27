import { isEmail } from 'class-validator';
import type { AuditService } from '../core/audit.service.js';
import { hashPassword } from '../core/passwords.js';
import type { PrismaService } from '../core/prisma.service.js';
import { generateToken } from '../core/tokens.js';

export interface CreateAdminInput {
  email: string;
  /** Used only when the account is new; defaults to the part of the email before the @. */
  name?: string;
  /** Replace the password of an existing account that already has one. */
  resetPassword?: boolean;
}

export interface CreateAdminResult {
  userId: string;
  email: string;
  created: boolean;
  /** The new password, shown once; null when the existing password was kept. */
  password: string | null;
}

/**
 * Makes `email` a platform admin: the way into a real deployment, where DEMO_MODE=false and
 * no seeded account has a password.
 *
 * - New account: created as admin with a random password.
 * - Existing account: promoted; its password is kept unless it has none or `resetPassword`.
 *
 * The password is 256 random bits, returned to the caller to print once. It is never logged or
 * written to the audit trail. Runs in one transaction with its audit rows; the actor is null
 * because the operator at the server's shell is not a user of the portal.
 */
export async function createAdmin(
  prisma: PrismaService,
  audit: AuditService,
  input: CreateAdminInput,
): Promise<CreateAdminResult> {
  const email = input.email.trim().toLowerCase();
  if (!isEmail(email)) throw new Error(`not an email address: ${input.email}`);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email } });
    const needsPassword = !existing?.passwordHash || input.resetPassword === true;
    const password = needsPassword ? generateToken() : null;
    const passwordHash = password ? await hashPassword(password) : undefined;

    if (!existing) {
      const user = await tx.user.create({
        data: {
          email,
          name: input.name?.trim() || email.split('@')[0]!,
          passwordHash,
          isAdmin: true,
        },
      });
      await audit.record(tx, {
        action: 'user.admin_granted',
        targetType: 'user',
        targetId: user.id,
        after: { email, isAdmin: true, created: true },
      });
      return { userId: user.id, email, created: true, password };
    }

    await tx.user.update({ where: { id: existing.id }, data: { isAdmin: true, passwordHash } });
    if (!existing.isAdmin) {
      await audit.record(tx, {
        action: 'user.admin_granted',
        targetType: 'user',
        targetId: existing.id,
        before: { isAdmin: false },
        after: { isAdmin: true },
      });
    }
    if (password) {
      await audit.record(tx, {
        action: 'user.password_reset',
        targetType: 'user',
        targetId: existing.id,
        after: { by: 'cli create-admin' },
      });
    }
    return { userId: existing.id, email, created: false, password };
  });
}
