import { hash, verify } from '@node-rs/argon2';

/** argon2id with the library defaults (OWASP-recommended parameters). */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(
  passwordHash: string | null,
  password: string,
): Promise<boolean> {
  if (!passwordHash) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * Compared against when the email is unknown, so a failed login takes the same time whether
 * or not the account exists (no user enumeration by timing).
 */
export const DUMMY_HASH_INPUT = 'evenhand-timing-equaliser';
