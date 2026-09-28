-- AlterTable
ALTER TABLE "custom_questions" ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "is_public" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "custom_questions_event_id_external_id_key" ON "custom_questions"("event_id", "external_id");

-- Hand-written (Prisma cannot express CHECK constraints or triggers). Tested in
-- tests/api/constraints.e2e-spec.ts.

-- A question says something, and an answer is never blank: clearing an answer deletes its row.
ALTER TABLE "custom_questions"
  ADD CONSTRAINT "custom_questions_prompt_valid"
  CHECK (char_length(btrim("prompt")) BETWEEN 1 AND 300);

ALTER TABLE "answers"
  ADD CONSTRAINT "answers_value_valid"
  CHECK (char_length(btrim("value")) >= 1 AND char_length("value") <= 5000);

-- An answer belongs to a question of its own submission's event, never another event's.
CREATE FUNCTION "answer_same_event"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "custom_questions" q
    JOIN "submissions" s ON s."event_id" = q."event_id"
    WHERE q."id" = NEW."question_id" AND s."id" = NEW."submission_id"
  ) THEN
    RAISE EXCEPTION 'answer to question % is not for the event of submission %',
      NEW."question_id", NEW."submission_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "answers_same_event"
  BEFORE INSERT OR UPDATE ON "answers"
  FOR EACH ROW EXECUTE FUNCTION "answer_same_event"();
