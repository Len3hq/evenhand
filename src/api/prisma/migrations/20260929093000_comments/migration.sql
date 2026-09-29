-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden_at" TIMESTAMPTZ(3),
    "hidden_by_id" UUID,
    "hide_reason" TEXT,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comments_submission_id_created_at_idx" ON "comments"("submission_id", "created_at");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_hidden_by_id_fkey" FOREIGN KEY ("hidden_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written (Prisma cannot express CHECK constraints). Tested in
-- tests/api/constraints.e2e-spec.ts.

-- A comment says something and stays readable: 1 to 2,000 characters, not just spaces.
ALTER TABLE "comments"
  ADD CONSTRAINT "comments_body_valid"
  CHECK (char_length(btrim("body")) >= 1 AND char_length("body") <= 2000);

-- Whoever hid a comment is recorded only on a hidden comment. (The reverse is not required:
-- hidden_by_id is cleared if that account is ever removed, and the comment stays hidden.)
ALTER TABLE "comments"
  ADD CONSTRAINT "comments_hidden_consistent"
  CHECK ("hidden_by_id" IS NULL OR "hidden_at" IS NOT NULL);
