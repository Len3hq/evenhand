-- Constraints Prisma's schema language cannot express. Each one has an e2e test in
-- tests/api/constraints.e2e-spec.ts proving it fires. See DATA-MODEL.md → "Constraints".

-- 1. One live submission per team per event (BUILD-PLAN decision 4, ADR 0004).
--    A row stops counting once it is superseded by a merged duplicate, or while it is the
--    older copy of an imported duplicate awaiting the organiser's decision (duplicate_hold).
CREATE UNIQUE INDEX "submissions_one_live_per_team"
  ON "submissions" ("event_id", "team_id")
  WHERE "superseded_by_id" IS NULL AND NOT "duplicate_hold";

-- 2. The audit log is append-only (decision 53). No UPDATE, DELETE or TRUNCATE, ever,
--    whatever the application code does.
CREATE FUNCTION "audit_log_append_only"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  -- Default SQLSTATE P0001 (raise_exception): client libraries surface this message as is.
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END;
$$;

CREATE TRIGGER "audit_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();

CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();

-- 3. Rubric sanity, and every score inside its criterion's range.
ALTER TABLE "criteria"
  ADD CONSTRAINT "criteria_range_valid" CHECK ("min" <= "max"),
  ADD CONSTRAINT "criteria_weight_non_negative" CHECK ("weight" >= 0);

CREATE FUNCTION "criterion_score_in_range"() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  c_min integer;
  c_max integer;
  c_key text;
BEGIN
  SELECT "min", "max", "key" INTO c_min, c_max, c_key FROM "criteria" WHERE "id" = NEW."criterion_id";
  IF NEW."value" < c_min OR NEW."value" > c_max THEN
    RAISE EXCEPTION 'score % for criterion "%" is outside [%, %]', NEW."value", c_key, c_min, c_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "criterion_scores_in_range"
  BEFORE INSERT OR UPDATE ON "criterion_scores"
  FOR EACH ROW EXECUTE FUNCTION "criterion_score_in_range"();
