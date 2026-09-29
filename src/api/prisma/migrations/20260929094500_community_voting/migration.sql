-- CreateEnum
CREATE TYPE "voting_mode" AS ENUM ('ACCOUNTS', 'EMAIL_LIST', 'OPEN_LINK');

-- CreateTable
CREATE TABLE "voting_rounds" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "mode" "voting_mode" NOT NULL,
    "opens_at" TIMESTAMPTZ(3) NOT NULL,
    "closes_at" TIMESTAMPTZ(3) NOT NULL,
    "votes_per_voter" INTEGER NOT NULL DEFAULT 1,
    "link_token_hash" TEXT,
    "results_published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voting_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voter_passes" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voter_passes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ballots" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "user_id" UUID,
    "pass_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ballots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "ballot_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("ballot_id","submission_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voting_rounds_event_id_key" ON "voting_rounds"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "voting_rounds_link_token_hash_key" ON "voting_rounds"("link_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "voter_passes_token_hash_key" ON "voter_passes"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "voter_passes_round_id_email_key" ON "voter_passes"("round_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "ballots_pass_id_key" ON "ballots"("pass_id");

-- CreateIndex
CREATE UNIQUE INDEX "ballots_round_id_user_id_key" ON "ballots"("round_id", "user_id");

-- CreateIndex
CREATE INDEX "votes_submission_id_idx" ON "votes"("submission_id");

-- AddForeignKey
ALTER TABLE "voting_rounds" ADD CONSTRAINT "voting_rounds_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_passes" ADD CONSTRAINT "voter_passes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "voting_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "voting_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_pass_id_fkey" FOREIGN KEY ("pass_id") REFERENCES "voter_passes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_ballot_id_fkey" FOREIGN KEY ("ballot_id") REFERENCES "ballots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written (Prisma cannot express CHECK constraints). Tested in
-- tests/api/constraints.e2e-spec.ts.

-- A voting window closes after it opens, and a voter has 1 to 10 votes.
ALTER TABLE "voting_rounds"
  ADD CONSTRAINT "voting_rounds_window_valid" CHECK ("closes_at" > "opens_at");
ALTER TABLE "voting_rounds"
  ADD CONSTRAINT "voting_rounds_votes_per_voter_valid" CHECK ("votes_per_voter" BETWEEN 1 AND 10);
-- Only an open-link vote has a shared link.
ALTER TABLE "voting_rounds"
  ADD CONSTRAINT "voting_rounds_link_only_open" CHECK ("link_token_hash" IS NULL OR "mode" = 'OPEN_LINK');

-- A ballot belongs to an account or to a voting link, never both and never neither.
ALTER TABLE "ballots"
  ADD CONSTRAINT "ballots_one_voter" CHECK (("user_id" IS NULL) <> ("pass_id" IS NULL));
