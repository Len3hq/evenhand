-- CreateEnum
CREATE TYPE "event_role_kind" AS ENUM ('PARTICIPANT', 'JUDGE', 'ORGANIZER');

-- CreateEnum
CREATE TYPE "submission_status" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "eligibility" AS ENUM ('ELIGIBLE', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "duplicate_reason" AS ENUM ('SAME_TEAM', 'SAME_REPO', 'SAME_TITLE');

-- CreateEnum
CREATE TYPE "duplicate_status" AS ENUM ('PENDING', 'CONFIRMED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('DRAFT', 'FINAL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "external_id" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "opens_at" TIMESTAMPTZ(3),
    "submissions_close" TIMESTAMPTZ(3) NOT NULL,
    "judging_close" TIMESTAMPTZ(3),
    "results_published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "external_id" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prizes" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "track_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_roles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "role" "event_role_kind" NOT NULL,
    "external_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judge_tracks" (
    "judge_role_id" UUID NOT NULL,
    "track_id" UUID NOT NULL,

    CONSTRAINT "judge_tracks_pkey" PRIMARY KEY ("judge_role_id","track_id")
);

-- CreateTable
CREATE TABLE "criteria" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "min" INTEGER NOT NULL DEFAULT 1,
    "max" INTEGER NOT NULL DEFAULT 5,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "external_id" TEXT,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "team_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("team_id","user_id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 4,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "track_id" UUID,
    "external_id" TEXT,
    "seed_order" INTEGER,
    "title" TEXT NOT NULL,
    "tagline" TEXT,
    "summary" TEXT,
    "description" TEXT,
    "thumbnail_url" TEXT,
    "repo_url" TEXT,
    "demo_video_url" TEXT,
    "live_url" TEXT,
    "tech_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "submission_status" NOT NULL DEFAULT 'DRAFT',
    "eligibility" "eligibility" NOT NULL DEFAULT 'ELIGIBLE',
    "disqualify_reason" TEXT,
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "superseded_by_id" UUID,
    "duplicate_hold" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_images" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "submission_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_questions" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "custom_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "submission_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("submission_id","question_id")
);

-- CreateTable
CREATE TABLE "duplicate_flags" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "kept_id" UUID NOT NULL,
    "superseded_id" UUID NOT NULL,
    "reason" "duplicate_reason" NOT NULL,
    "status" "duplicate_status" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "duplicate_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conflicts_of_interest" (
    "judge_role_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "reason" TEXT,

    CONSTRAINT "conflicts_of_interest_pkey" PRIMARY KEY ("judge_role_id","team_id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "judge_role_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "batch" TEXT NOT NULL,
    "queue_position" INTEGER NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "status" "review_status" NOT NULL DEFAULT 'DRAFT',
    "comment" TEXT NOT NULL DEFAULT '',
    "superseded" BOOLEAN NOT NULL DEFAULT false,
    "original_submission_id" UUID,
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "criterion_scores" (
    "review_id" UUID NOT NULL,
    "criterion_id" UUID NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "criterion_scores_pkey" PRIMARY KEY ("review_id","criterion_id")
);

-- CreateTable
CREATE TABLE "ranking_runs" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "inputs_hash" TEXT NOT NULL,
    "output_hash" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "ranking_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_rows" (
    "run_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "raw_mean" DOUBLE PRECISION NOT NULL,
    "normalized" DOUBLE PRECISION NOT NULL,
    "posterior_sd" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "tie_group" INTEGER NOT NULL,
    "n_reviews" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "ranking_rows_pkey" PRIMARY KEY ("run_id","submission_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "event_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_external_id_key" ON "events"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_event_id_external_id_key" ON "tracks"("event_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_event_id_name_key" ON "tracks"("event_id", "name");

-- CreateIndex
CREATE INDEX "prizes_event_id_idx" ON "prizes"("event_id");

-- CreateIndex
CREATE INDEX "event_roles_event_id_role_idx" ON "event_roles"("event_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "event_roles_user_id_event_id_role_key" ON "event_roles"("user_id", "event_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "event_roles_event_id_external_id_key" ON "event_roles"("event_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "criteria_event_id_key_key" ON "criteria"("event_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "teams_event_id_external_id_key" ON "teams"("event_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_event_id_user_id_key" ON "team_members"("event_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites"("token_hash");

-- CreateIndex
CREATE INDEX "submissions_event_id_status_eligibility_idx" ON "submissions"("event_id", "status", "eligibility");

-- CreateIndex
CREATE INDEX "submissions_team_id_idx" ON "submissions"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_event_id_external_id_key" ON "submissions"("event_id", "external_id");

-- CreateIndex
CREATE INDEX "submission_images_submission_id_idx" ON "submission_images"("submission_id");

-- CreateIndex
CREATE INDEX "custom_questions_event_id_idx" ON "custom_questions"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "duplicate_flags_kept_id_superseded_id_key" ON "duplicate_flags"("kept_id", "superseded_id");

-- CreateIndex
CREATE INDEX "assignments_submission_id_idx" ON "assignments"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_judge_role_id_submission_id_key" ON "assignments"("judge_role_id", "submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_assignment_id_key" ON "reviews"("assignment_id");

-- CreateIndex
CREATE INDEX "ranking_runs_event_id_idx" ON "ranking_runs"("event_id");

-- CreateIndex
CREATE INDEX "audit_log_event_id_at_idx" ON "audit_log"("event_id", "at");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log"("actor_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_roles" ADD CONSTRAINT "event_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_roles" ADD CONSTRAINT "event_roles_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_tracks" ADD CONSTRAINT "judge_tracks_judge_role_id_fkey" FOREIGN KEY ("judge_role_id") REFERENCES "event_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_tracks" ADD CONSTRAINT "judge_tracks_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_images" ADD CONSTRAINT "submission_images_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_questions" ADD CONSTRAINT "custom_questions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "custom_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_kept_id_fkey" FOREIGN KEY ("kept_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_superseded_id_fkey" FOREIGN KEY ("superseded_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts_of_interest" ADD CONSTRAINT "conflicts_of_interest_judge_role_id_fkey" FOREIGN KEY ("judge_role_id") REFERENCES "event_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conflicts_of_interest" ADD CONSTRAINT "conflicts_of_interest_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_judge_role_id_fkey" FOREIGN KEY ("judge_role_id") REFERENCES "event_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_original_submission_id_fkey" FOREIGN KEY ("original_submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criterion_scores" ADD CONSTRAINT "criterion_scores_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "criterion_scores" ADD CONSTRAINT "criterion_scores_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_runs" ADD CONSTRAINT "ranking_runs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_rows" ADD CONSTRAINT "ranking_rows_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ranking_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_rows" ADD CONSTRAINT "ranking_rows_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
