-- Hash-chained audit log (BUILD-PLAN stretch #1). Every entry stores the previous entry's hash
-- and a SHA-256 of its own canonical JSON (prev_hash included), both computed here, by the
-- database, on insert: no application code path can skip or forge them. Editing or deleting
-- any earlier entry, even as a database superuser with the append-only triggers disabled,
-- breaks the chain, and GET /api/audit/verify says where. See ADR 20260928-1900.

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "prev_hash" TEXT;

-- CreateIndex: no two entries may claim the same predecessor (that would be a fork).
CREATE UNIQUE INDEX "audit_log_prev_hash_key" ON "audit_log"("prev_hash");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_hash_key" ON "audit_log"("hash");

-- The canonical form: a JSON object of every column except `hash`. jsonb normalises key order
-- and whitespace, so the same row always gives the same text. Timestamps are written in UTC
-- with milliseconds, which is the column's precision.
CREATE FUNCTION "audit_log_hash"(a "audit_log") RETURNS text
  LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(jsonb_build_object(
    'id', a."id",
    'at', to_char(a."at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'actor_id', a."actor_id",
    'event_id', a."event_id",
    'action', a."action",
    'target_type', a."target_type",
    'target_id', a."target_id",
    'before', a."before",
    'after', a."after",
    'ip', a."ip",
    'prev_hash', a."prev_hash"
  )::text, 'UTF8')), 'hex');
$$;

-- The chain's current head: one row, so finding it costs nothing however long the log gets.
-- Locking it (FOR UPDATE) makes concurrent writers take their turn, so the chain never forks.
CREATE TABLE "audit_chain_head" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "hash" TEXT NOT NULL,

    CONSTRAINT "audit_chain_head_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_chain_head_single_row" CHECK ("id" = 1)
);
INSERT INTO "audit_chain_head" ("id", "hash") VALUES (1, repeat('0', 64));

-- On insert: lock the head, link to it, hash, move the head forward.
CREATE FUNCTION "audit_log_chain"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  SELECT h."hash" INTO NEW."prev_hash" FROM "audit_chain_head" h WHERE h."id" = 1 FOR UPDATE;
  NEW."hash" := "audit_log_hash"(NEW);
  UPDATE "audit_chain_head" SET "hash" = NEW."hash" WHERE "id" = 1;
  RETURN NEW;
END;
$$;

-- Backfill the entries written before this migration, in id order. The append-only trigger
-- would refuse these UPDATEs, so it is off for this one statement block only.
ALTER TABLE "audit_log" DISABLE TRIGGER "audit_log_no_update_delete";
DO $$
DECLARE
  r "audit_log";
  prev text := repeat('0', 64);
BEGIN
  FOR r IN SELECT * FROM "audit_log" ORDER BY "id" LOOP
    r."prev_hash" := prev;
    prev := "audit_log_hash"(r);
    UPDATE "audit_log" SET "prev_hash" = r."prev_hash", "hash" = prev WHERE "id" = r."id";
  END LOOP;
  UPDATE "audit_chain_head" SET "hash" = prev WHERE "id" = 1;
END;
$$;
ALTER TABLE "audit_log" ENABLE TRIGGER "audit_log_no_update_delete";

CREATE TRIGGER "audit_log_chain"
  BEFORE INSERT ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_chain"();
