-- Data fix: migrate existing APPLY_OR_PAY rows to TICKETED before enum swap.
-- Both rows have approvalRequired = true, so semantics are preserved.
UPDATE "Event" SET "accessMode" = 'TICKETED' WHERE "accessMode" = 'APPLY_OR_PAY';

-- AlterEnum: remove APPLY_OR_PAY, leaving OPEN and TICKETED only.
BEGIN;
CREATE TYPE "EventAccessMode_new" AS ENUM ('OPEN', 'TICKETED');
ALTER TABLE "public"."Event" ALTER COLUMN "accessMode" DROP DEFAULT;
ALTER TABLE "public"."EventSeries" ALTER COLUMN "defaultAccessMode" DROP DEFAULT;
ALTER TABLE "Event" ALTER COLUMN "accessMode" TYPE "EventAccessMode_new" USING ("accessMode"::text::"EventAccessMode_new");
ALTER TABLE "EventSeries" ALTER COLUMN "defaultAccessMode" TYPE "EventAccessMode_new" USING ("defaultAccessMode"::text::"EventAccessMode_new");
ALTER TYPE "EventAccessMode" RENAME TO "EventAccessMode_old";
ALTER TYPE "EventAccessMode_new" RENAME TO "EventAccessMode";
DROP TYPE "public"."EventAccessMode_old";
ALTER TABLE "Event" ALTER COLUMN "accessMode" SET DEFAULT 'OPEN';
ALTER TABLE "EventSeries" ALTER COLUMN "defaultAccessMode" SET DEFAULT 'OPEN';
COMMIT;

-- AlterTable: drop the now-orphaned applyMode column.
ALTER TABLE "Event" DROP COLUMN "applyMode";

-- DropEnum: remove EventApplyMode entirely.
DROP TYPE "EventApplyMode";
