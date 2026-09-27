import type { AuditService } from '../core/audit.service.js';
import { hashPassword } from '../core/passwords.js';
import type { PrismaService } from '../core/prisma.service.js';
import { generateToken } from '../core/tokens.js';

/**
 * Gives an existing account a new random password, returned once for the operator to pass
 * on. The portal sends no email, so this is how imported judges and participants (who arrive
 * with no password) and people who forgot theirs get in. Audited; the password is not.
 */
export async function resetPassword(
  prisma: PrismaService,
  audit: AuditService,
  rawEmail: string,
): Promise<string> {
  const email = rawEmail.trim().toLowerCase();
  const password = generateToken();
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { email } });
    if (!user) throw new Error(`no account for ${email}`);
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await audit.record(tx, {
      action: 'user.password_reset',
      targetType: 'user',
      targetId: user.id,
      after: { by: 'cli reset-password' },
    });
  });
  return password;
}
