/**
 * `cli create-admin`: the way into a real deployment (DEMO_MODE=false), where no seeded
 * account has a password. Driven through the real CLI, as an operator would run it.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTestApp, type TestApp } from './helpers.js';

const apiDir = fileURLToPath(new URL('../../src/api', import.meta.url));

function cli(...args: string[]): string {
  return execFileSync('node', ['dist/cli/cli.js', 'create-admin', ...args], {
    cwd: apiDir,
    env: { ...process.env },
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

const passwordIn = (out: string): string => /password \(shown once[^:]*\): (\S+)/.exec(out)![1]!;

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

const login = (email: string, password: string) =>
  t.http().post('/api/auth/login').send({ email, password });

describe('cli create-admin', () => {
  it('creates an admin who can log in with the printed password', async () => {
    const out = cli('Ops@Example.org', '--name', 'Ops Lead');
    expect(out).toContain('created admin ops@example.org');

    const res = await login('ops@example.org', passwordIn(out));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: 'ops@example.org', name: 'Ops Lead', isAdmin: true });
  });

  it('audits the grant and never writes the password to the audit trail', async () => {
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: 'ops@example.org' } });
    const rows = await t.prisma.auditLog.findMany({ where: { targetId: user.id } });
    // The previous test also logged in, which is audited as auth.login.
    expect(rows.filter((r) => r.action.startsWith('user.')).map((r) => r.action)).toEqual([
      'user.admin_granted',
    ]);
    const payloads = JSON.stringify(rows.map((r) => [r.before, r.after]));
    expect(payloads).not.toMatch(/password|argon2/i);
  });

  it('promotes an existing account and keeps its password unless asked to reset it', async () => {
    const email = 'promote-me@example.org';
    const original = 'original-password-1';
    const registered = await t
      .http()
      .post('/api/auth/register')
      .send({ email, name: 'Promote Me', password: original });
    expect(registered.status).toBe(201);
    expect(registered.body.isAdmin).toBe(false);

    expect(cli(email)).toContain('existing password kept');
    const kept = await login(email, original);
    expect(kept.status).toBe(200);
    expect(kept.body.isAdmin).toBe(true);

    const reset = passwordIn(cli(email, '--reset-password'));
    expect((await login(email, original)).status).toBe(401);
    expect((await login(email, reset)).status).toBe(200);
  });

  it('gives a password to an existing account that has none', async () => {
    const email = 'no-password@example.org';
    await t.prisma.user.create({ data: { email, name: 'Imported', passwordHash: null } });
    const out = cli(email);
    expect((await login(email, passwordIn(out))).status).toBe(200);
  });

  it('refuses something that is not an email address', () => {
    expect(() => cli('not-an-email')).toThrow(/not an email address/);
  });
});
