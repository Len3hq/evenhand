-- AlterTable
-- Nothing has written to submission_images before this migration (there was no upload path),
-- so the new NOT NULL columns need no default.
ALTER TABLE "submission_images" ADD COLUMN     "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "height" INTEGER NOT NULL,
ADD COLUMN     "width" INTEGER NOT NULL;

-- Hand-written (Prisma cannot express CHECK constraints). Tested in
-- tests/api/constraints.e2e-spec.ts.

-- The API re-encodes every image to at most 1600 px on its longest side.
ALTER TABLE "submission_images"
  ADD CONSTRAINT "submission_images_size_valid"
  CHECK ("width" BETWEEN 1 AND 1600 AND "height" BETWEEN 1 AND 1600);

ALTER TABLE "submission_images"
  ADD CONSTRAINT "submission_images_order_valid"
  CHECK ("order" >= 0);
