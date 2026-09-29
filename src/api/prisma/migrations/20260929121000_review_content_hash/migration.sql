-- Which version of an entry each review scored (reviews.content_hash, set on submit), so
-- organisers can see reviews of a version the team has changed since.

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "content_hash" TEXT;
