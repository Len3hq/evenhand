/**
 * The audit log's hash chain (migration *_audit_hash_chain): the database links and hashes
 * every entry on insert, and GET /api/audit/verify finds edits, deletions and truncation, even
 * ones made directly in the database with the append-only trigger switched off. Every
 * tampering here is undone afterwards, so the suites that follow see an intact log.
 */
import { bearer, createTestApp, type TestApp, TOKENS, tokenFor } from './helpers.js';

let t: TestApp;
let admin: Record<string, string>;
const organizer = bearer(TOKENS.organizer);

beforeAll(async () => {
  t = await createTestApp();
  admin = bearer(await tokenFor(t.prisma, 'admin@evenhand.local', 'chain-admin'));
});
afterAll(() => t.close());

const verify = async (as = admin) => (await t.http().get('/api/audit/verify').set(as)).body;

/** Runs SQL as the database owner with the audit triggers off, as an attacker with DB access would. */
async function tamper(sql: string): Promise<void> {
  await t.prisma.$transaction([
    t.prisma.$executeRawUnsafe('ALTER TABLE audit_log DISABLE TRIGGER USER'),
    t.prisma.$executeRawUnsafe(sql),
    t.prisma.$executeRawUnsafe('ALTER TABLE audit_log ENABLE TRIGGER USER'),
  ]);
}

interface RawEntry {
  id: bigint;
  after: unknown;
}

/** Deletes an entry (triggers off) and returns a function that puts it back exactly. */
async function removeEntry(id: bigint): Promise<() => Promise<void>> {
  const rows = await t.prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    'SELECT * FROM audit_log WHERE id = $1',
    id,
  );
  const row = rows[0]!;
  await tamper(`DELETE FROM audit_log WHERE id = ${id}`);
  return async () => {
    const cols = Object.keys(row);
    const values = cols.map((c) => row[c]);
    const params = cols.map((c, i) =>
      c === 'before' || c === 'after' ? `$${i + 1}::jsonb` : `$${i + 1}`,
    );
    await t.prisma.$transaction([
      t.prisma.$executeRawUnsafe('ALTER TABLE audit_log DISABLE TRIGGER USER'),
      t.prisma.$executeRawUnsafe(
        `INSERT INTO audit_log (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${params.join(',')})`,
        ...values.map((v, i) =>
          (cols[i] === 'before' || cols[i] === 'after') && v !== null ? JSON.stringify(v) : v,
        ),
      ),
      t.prisma.$executeRawUnsafe('ALTER TABLE audit_log ENABLE TRIGGER USER'),
    ]);
  };
}

describe('the audit hash chain', () => {
  it('is intact after the seed and ordinary activity, every entry linked', async () => {
    const res = await verify();
    expect(res).toMatchObject({ intact: true, alteredCount: 0, brokenCount: 0, headMatches: true });
    expect(res.entries).toBeGreaterThan(0);
    expect(res.linked).toBe(res.entries);
    expect(res.head).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stays one chain when many entries are written at the same moment', async () => {
    const before = (await verify()).entries;
    // Each failed login writes an audit entry; 25 at once race for the chain's head.
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        t
          .http()
          .post('/api/auth/login')
          .send({ email: `nobody${i}@chain.test`, password: 'x' }),
      ),
    );
    const res = await verify();
    expect(res.entries).toBe(before + 25);
    expect(res).toMatchObject({ intact: true, linked: res.entries });
  });

  it('finds an entry edited in the database, and says which', async () => {
    const [target] = await t.prisma.$queryRawUnsafe<RawEntry[]>(
      'SELECT id, after FROM audit_log ORDER BY id LIMIT 1 OFFSET 2',
    );
    const original = JSON.stringify(target!.after);
    await tamper(`UPDATE audit_log SET after = '{"tampered":true}' WHERE id = ${target!.id}`);
    try {
      const res = await verify();
      expect(res.intact).toBe(false);
      expect(res.altered).toContain(String(target!.id));
      expect(res.alteredCount).toBe(1);
    } finally {
      await tamper(
        original === 'null'
          ? `UPDATE audit_log SET after = NULL WHERE id = ${target!.id}`
          : `UPDATE audit_log SET after = '${original.replaceAll("'", "''")}'::jsonb WHERE id = ${target!.id}`,
      );
    }
    expect((await verify()).intact).toBe(true);
  });

  it('finds an entry deleted from the middle', async () => {
    const [target] = await t.prisma.$queryRawUnsafe<RawEntry[]>(
      'SELECT id FROM audit_log ORDER BY id LIMIT 1 OFFSET 3',
    );
    const restore = await removeEntry(target!.id);
    try {
      const res = await verify();
      expect(res.intact).toBe(false);
      expect(res.brokenCount).toBe(1);
      expect(res.linked).toBeLessThan(res.entries);
    } finally {
      await restore();
    }
    expect((await verify()).intact).toBe(true);
  });

  it('finds the newest entries cut off the end', async () => {
    const [newest] = await t.prisma.$queryRawUnsafe<RawEntry[]>(
      'SELECT a.id FROM audit_log a JOIN audit_chain_head h ON h.hash = a.hash',
    );
    const restore = await removeEntry(newest!.id);
    try {
      const res = await verify();
      expect(res.intact).toBe(false);
      expect(res.headMatches).toBe(false);
      // The rest of the chain is still consistent: only the head gives it away.
      expect(res.brokenCount).toBe(0);
    } finally {
      await restore();
    }
    expect((await verify()).intact).toBe(true);
  });

  it('is for organisers and admins; only admins see which entries are affected', async () => {
    expect((await t.http().get('/api/audit/verify')).status).toBe(401);
    expect((await t.http().get('/api/audit/verify').set(bearer(TOKENS.participant))).status).toBe(
      403,
    );
    expect((await t.http().get('/api/audit/verify').set(bearer(TOKENS.judge_a))).status).toBe(403);
    const asOrganizer = await verify(organizer);
    expect(asOrganizer.intact).toBe(true);
    expect(asOrganizer).toMatchObject({ altered: [], broken: [] });
  });
});
