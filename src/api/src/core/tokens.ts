import { createHash, randomBytes } from 'node:crypto';

/** A new random secret for a session cookie, bearer token or invite link (256 bits). */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * What the database stores instead of the secret itself. SHA-256 is enough here: the input is
 * a 256-bit random value, not a password, so there is nothing to brute-force.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
