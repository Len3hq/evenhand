/**
 * `cli tokens`: bearer tokens for scripts and integrations in a real deployment, and the way
 * to shut the public demo tokens. Driven through the real CLI, as an operator would run it.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashToken } from '../../src/api/src/core/tokens.js';
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';

const apiDir = fileURLToPath(new URL('../../src/api', import.meta.url));

function cli(...args: string[]): string {
  return execFileSync('node', ['dist/cli/cli.js', 'tokens', ...args], {
    cwd: apiDir,
    env: { ...process.env },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

const EMAIL = 'tokens-owner@example.org';
const secretIn = (out: string): string => /Authorization: Bearer (\S+)/.exec(out)![1]!;
const idIn = (out: string): string => /^token (\S+)/.exec(out)![1]!;

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
  await t.prisma.user.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, name: 'Token Owner' },
    update: {},
  });
});
afterAll(async () => {
  // Other suites rely on the demo tokens: undo the --demo test whatever happened.
  await t.prisma.apiToken.updateMany({ where: { isDemo: true }, data: { revokedAt: null } });
  await t.close();
});

const me = (token: string) => t.http().get('/api/auth/me').set(bearer(token));

describe('cli tokens', () => {
  let id: string;
  let secret: string;

  it('creates a token that acts as its account, printed once and stored only as a hash', async () => {
    const out = cli('create', 'Tokens-Owner@Example.org', '--label', 'ci-export');
    id = idIn(out);
    secret = secretIn(out);
    expect(out).toContain(`"ci-export" for ${EMAIL}`);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const res = await me(secret);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(EMAIL);

    const row = await t.prisma.apiToken.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ tokenHash: hashToken(secret), isDemo: false, revokedAt: null });
  });

  it('audits the grant by label, never the secret or its hash', async () => {
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    const rows = await t.prisma.auditLog.findMany({
      where: { targetId: user.id, action: 'token.created' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.after).toMatchObject({ tokenId: id, label: 'ci-export' });
    const payload = JSON.stringify(rows.map((r) => [r.before, r.after]));
    expect(payload).not.toContain(secret);
    expect(payload).not.toContain(hashToken(secret));
  });

  it('lists tokens with their state and never prints a secret or hash', () => {
    const out = cli('list', EMAIL);
    expect(out).toContain(`${id}  ${EMAIL}  "ci-export"`);
    expect(out).toContain('active');
    expect(out).not.toContain(secret);
    expect(out).not.toContain(hashToken(secret));

    const all = cli('list');
    expect(all).toMatch(/"demo:organizer" demo {2}created \S+ {2}active/);
  });

  it('revokes a token: it stops working at once, and revoking again changes nothing', async () => {
    expect(cli('revoke', id)).toBe(`revoked ${id}\n`);
    expect((await me(secret)).status).toBe(401);
    expect(cli('list', EMAIL)).toMatch(/revoked \d{4}-\d\d-\d\dT/);

    expect(cli('revoke', id)).toBe('nothing to revoke: already revoked\n');
    const audited = await t.prisma.auditLog.count({
      where: { action: 'token.revoked', after: { path: ['tokenId'], equals: id } },
    });
    expect(audited).toBe(1);
  });

  it('revokes every demo token with --demo, and the seeder does not bring them back', async () => {
    expect((await me(TOKENS.organizer)).status).toBe(200);
    const out = cli('revoke', '--demo');
    expect(out.trim().split(' ')).toHaveLength(1 + Object.keys(TOKENS).length);
    for (const token of Object.values(TOKENS)) {
      expect((await me(token)).status).toBe(401);
    }
    expect(cli('revoke', '--demo')).toBe('nothing to revoke: already revoked\n');

    // A restart re-runs the seed: revoked demo tokens stay revoked.
    execFileSync('node', ['dist/cli/cli.js', 'seed'], {
      cwd: apiDir,
      env: { ...process.env },
      stdio: 'pipe',
    });
    expect((await me(TOKENS.organizer)).status).toBe(401);
  });

  it('refuses unknown accounts, unknown ids and bad labels without writing anything', async () => {
    const before = await t.prisma.apiToken.count();
    expect(() => cli('create', 'nobody@example.org', '--label', 'x')).toThrow(/no account/);
    expect(() => cli('create', EMAIL)).toThrow(/needs --label/);
    expect(() => cli('create', EMAIL, '--label', 'x'.repeat(81))).toThrow(/1 to 80 characters/);
    expect(() => cli('revoke', 'not-a-token')).toThrow(/no token not-a-token/);
    expect(() => cli('revoke', '0190a1b2-0000-7000-8000-000000000000')).toThrow(/no token/);
    expect(() => cli('list', 'nobody@example.org')).toThrow(/no account/);
    expect(() => cli('frobnicate')).toThrow(/create, list or revoke/);
    expect(await t.prisma.apiToken.count()).toBe(before);
  });
});
