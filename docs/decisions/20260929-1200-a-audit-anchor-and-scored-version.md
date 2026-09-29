# Anchoring the audit chain in published results; recording the version each review scored

- Status: accepted
- Date: 2026-09-29 · Owner: A

## Context

Two gaps were left in the threat model after the audit hash chain (ADR 20260928-1900):

1. Someone with full database access could recompute the whole chain after an edit. Nothing outside the database remembered what the chain looked like.
2. Teams may edit until the deadline (T1), and judging can start before it. A judge could therefore score a version the team later changed, and nobody would know.

## Decision

1. **Audit anchor.** When results are published, inside the publish transaction and after the `ranking.published` entry is written, the chain's head is stored on the ranking run (`ranking_runs.audit_head`). The public results show it, together with a live check that the hash is still in the audit log. Rewriting any entry before publication changes every later hash, so the anchor disappears and the public page says so.
2. **Scored version.** When a judge submits a review, `reviews.content_hash` records a SHA-256 of the entry's content: text, links, tags, track, custom answers and image ids (`submissions/content-hash.ts`). The organisers' entries table counts reviews of an earlier version, and each ranking run lists those projects (`params.changedAfterReview`). Nothing is blocked: T1 lets teams edit until the deadline, and a final review stays final. The change is made visible, and organisers decide.

## Consequences

- The anchor protects history before the latest publication. Changes after it are still caught by the chain itself (`GET /api/audit/verify`), not by the anchor.
- Results published before this change have no anchor (`auditHead: null`).
- Reviews imported from fixtures.json have no content hash and are never flagged.
- Both are tested: `rankings.e2e-spec.ts` (anchor present; rewritten → reported missing; restored → present) and `reviews.e2e-spec.ts` (edit after a submitted review → counted in entries and in the ranking run).
