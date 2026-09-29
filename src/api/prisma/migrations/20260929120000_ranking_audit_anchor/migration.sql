-- Anchors the audit hash chain in published results: at publish, the ranking run records the
-- chain's head. See ADR 20260929-1200-a-audit-anchor.

-- AlterTable
ALTER TABLE "ranking_runs" ADD COLUMN     "audit_head" TEXT;
