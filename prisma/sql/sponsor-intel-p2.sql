-- Sponsor Intelligence — Phase 2 additive migration (activation loop)
-- Source: prisma migrate diff, hand-reviewed. The only statement removed was the false-drift
--   DROP INDEX "Asset_searchVector_idx";
-- (DAM GIN index lives only in prod; never drop it). Additive-only and idempotent.
-- EventCustomQuestion already holds data; ADD COLUMN is nullable (no rewrite/backfill).

ALTER TABLE "EventCustomQuestion" ADD COLUMN IF NOT EXISTS "sponsorBrandId" TEXT;

CREATE INDEX IF NOT EXISTS "EventCustomQuestion_sponsorBrandId_idx" ON "EventCustomQuestion"("sponsorBrandId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventCustomQuestion_sponsorBrandId_fkey') THEN
    ALTER TABLE "EventCustomQuestion" ADD CONSTRAINT "EventCustomQuestion_sponsorBrandId_fkey"
      FOREIGN KEY ("sponsorBrandId") REFERENCES "SponsorBrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
