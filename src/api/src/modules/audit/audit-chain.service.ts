import { Injectable } from '@nestjs/common';
import type { Actor } from '../../core/auth/actor.js';
import { Clock } from '../../core/clock.js';
import { forbidden } from '../../core/errors.js';
import { PrismaService } from '../../core/prisma.service.js';
import type { AuditChainDto } from './dto/audit.dto.js';

const GENESIS = '0'.repeat(64);
/** How many offending ids to list; the counts are always complete. */
const MAX_LISTED = 20;

interface ChainRow {
  entries: number;
  linked: number;
  tail: string | null;
  head: string | null;
  altered_count: number;
  broken_count: number;
  altered: string[];
  broken: string[];
}

/**
 * Checks the audit log's hash chain (migration *_audit_hash_chain), entirely in the database,
 * with the same `audit_log_hash()` function the insert trigger uses:
 *
 * 1. every entry's stored hash equals the hash of its content: nothing was edited;
 * 2. every entry's `prev_hash` is the hash of an existing entry: nothing before it was deleted;
 * 3. walking the links from the first entry reaches every entry and ends at the recorded head:
 *    no gap, and the newest entries were not removed.
 *
 * Someone with full database access can still rewrite the whole chain from the point they
 * changed; recording the head (`head`) somewhere else, e.g. in the published results or a note,
 * is what makes that detectable. See JUDGING.md → Threat model.
 */
@Injectable()
export class AuditChainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Admins see which entries are affected; organisers of any event see the verdict and counts. */
  async verify(actor: Actor): Promise<AuditChainDto> {
    if (!actor.isAdmin && !actor.hasRoleAnywhere('ORGANIZER')) throw forbidden();
    const result = await this.check();
    return actor.isAdmin ? result : { ...result, altered: [], broken: [] };
  }

  /** The full check, affected ids included. For the CLI (`cli verify-audit`) and `verify()`. */
  async check(): Promise<AuditChainDto> {
    const [row] = await this.prisma.$queryRaw<ChainRow[]>`
      WITH RECURSIVE chain AS (
        SELECT a."hash", 1 AS n FROM "audit_log" a WHERE a."prev_hash" = ${GENESIS}
        UNION ALL
        SELECT a."hash", c.n + 1 FROM "audit_log" a
          JOIN chain c ON a."prev_hash" = c."hash"
          WHERE c.n <= (SELECT count(*) FROM "audit_log")
      ),
      altered AS (
        SELECT a."id" FROM "audit_log" a WHERE a."hash" IS DISTINCT FROM "audit_log_hash"(a)
      ),
      broken AS (
        SELECT a."id" FROM "audit_log" a
        WHERE a."prev_hash" IS NULL
           OR (a."prev_hash" <> ${GENESIS}
               AND NOT EXISTS (SELECT 1 FROM "audit_log" p WHERE p."hash" = a."prev_hash"))
      )
      SELECT
        (SELECT count(*) FROM "audit_log")::int AS entries,
        (SELECT count(*) FROM chain)::int AS linked,
        (SELECT "hash" FROM chain ORDER BY n DESC LIMIT 1) AS tail,
        (SELECT "hash" FROM "audit_chain_head" WHERE "id" = 1) AS head,
        (SELECT count(*) FROM altered)::int AS altered_count,
        (SELECT count(*) FROM broken)::int AS broken_count,
        coalesce((SELECT array_agg(id::text ORDER BY id)
                  FROM (SELECT id FROM altered ORDER BY id LIMIT ${MAX_LISTED}) x), '{}') AS altered,
        coalesce((SELECT array_agg(id::text ORDER BY id)
                  FROM (SELECT id FROM broken ORDER BY id LIMIT ${MAX_LISTED}) y), '{}') AS broken`;
    const r = row!;
    const head = r.head ?? GENESIS;
    // An empty log is intact, and its "tail" is the genesis value the head starts at.
    const headMatches = (r.tail ?? GENESIS) === head;
    return {
      intact:
        r.altered_count === 0 && r.broken_count === 0 && r.linked === r.entries && headMatches,
      entries: r.entries,
      linked: r.linked,
      head,
      headMatches,
      altered: r.altered,
      broken: r.broken,
      alteredCount: r.altered_count,
      brokenCount: r.broken_count,
      checkedAt: this.clock.now().toISOString(),
    };
  }
}
