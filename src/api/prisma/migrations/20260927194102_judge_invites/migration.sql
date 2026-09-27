-- CreateTable
CREATE TABLE "judge_invites" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "track_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judge_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "judge_invites_token_hash_key" ON "judge_invites"("token_hash");

-- CreateIndex
CREATE INDEX "judge_invites_event_id_idx" ON "judge_invites"("event_id");

-- AddForeignKey
ALTER TABLE "judge_invites" ADD CONSTRAINT "judge_invites_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_invites" ADD CONSTRAINT "judge_invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written (Prisma cannot express CHECK constraints): a judge invite admits 1–50 people and
-- is never used more often than that, even if two acceptances race.
ALTER TABLE "judge_invites"
  ADD CONSTRAINT "judge_invites_max_uses_range" CHECK ("max_uses" BETWEEN 1 AND 50),
  ADD CONSTRAINT "judge_invites_uses_within_max" CHECK ("uses" >= 0 AND "uses" <= "max_uses");
