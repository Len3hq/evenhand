/**
 * Browser sessions, the Origin (CSRF) check, demo-token lock-out and rate limits.
 */
import { bearer, createTestApp, type TestApp, TOKENS } from './helpers.js';

const ORIGIN = 'http://localhost:8080';
const judge = { email: 'diego.herrera@example.org', password: 'evenhand-demo' };

describe('cookie sessions', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  const login = async () => {
    const res = await t.http().post('/api/auth/login').send(judge);
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    return cookie.split(';')[0]!;
  };

  it('logs in with a normalised email and reads /me with the cookie', async () => {
    const res = await t
      .http()
      .post('/api/auth/login')
      .send({ ...judge, email: ' Diego.Herrera@Example.org ' });
    expect(res.status).toBe(200);
    const cookie = await login();
    const me = await t.http().get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.roles).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'JUDGE', externalId: 'jdg_24' })]),
    );
  });

  it('refuses wrong passwords and unknown emails with the same answer, and audits both', async () => {
    const wrong = await t
      .http()
      .post('/api/auth/login')
      .send({ ...judge, password: 'nope-nope-nope' });
    const unknown = await t
      .http()
      .post('/api/auth/login')
      .send({ email: 'nobody@example.org', password: 'x' });
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(
      await t.prisma.auditLog.count({ where: { action: 'auth.login_failed' } }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('refuses cookie-authenticated writes without an allowed Origin (CSRF)', async () => {
    const cookie = await login();
    const none = await t.http().post('/api/auth/logout').set('Cookie', cookie);
    const evil = await t
      .http()
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example');
    expect(none.status).toBe(403);
    expect(evil.body.error).toBe('origin_not_allowed');
    const ok = await t.http().post('/api/auth/logout').set('Cookie', cookie).set('Origin', ORIGIN);
    expect(ok.status).toBe(204);
    const after = await t.http().get('/api/auth/me').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  it('does not apply the Origin check to bearer tokens (not an ambient credential)', async () => {
    const res = await t
      .http()
      .post('/api/events/evenhand-demo/submissions')
      .set(bearer(TOKENS.participant))
      .send({});
    expect(res.status).not.toBe(403);
  });

  it('rejects unknown body fields instead of ignoring them', async () => {
    const res = await t
      .http()
      .post('/api/auth/login')
      .send({ ...judge, isAdmin: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/isAdmin should not exist/);
  });
});

describe('with DEMO_MODE=false', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ config: { demoMode: false } });
  });
  afterAll(() => t.close());

  it('refuses the published demo tokens', async () => {
    const res = await t.http().get('/api/judge/scores').set(bearer(TOKENS.judge_a));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('demo_token_disabled');
  });
});

describe('rate limits', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp({ config: { rateLimitLoginPerMin: 3 } });
  });
  afterAll(() => t.close());

  it('answers 429 after too many login attempts from one address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push(
        (await t.http().post('/api/auth/login').send({ email: 'x@example.org', password: 'y' }))
          .status,
      );
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });

  it('does not count ordinary routes against the login limit', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await t.http().get('/api/projects')).status).toBe(200);
    }
  });
});
