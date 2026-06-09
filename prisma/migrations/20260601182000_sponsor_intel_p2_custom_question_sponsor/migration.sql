-- RECONCILIATION CATCH-UP MIGRATION
-- Records the out-of-band SQL in prisma/sql/sponsor-intel-p2.sql that was hand-applied
-- to the shared Neon instance but never tracked. Body is the EXACT idempotent SQL already
-- in prod; apply via
--   `prisma migrate resolve --applied 20260601182000_sponsor_intel_p2_custom_question_sponsor`
-- (writes a _prisma_migrations row only — ZERO DDL). See _context/MIGRATION-RECONCILIATION-RUNBOOK.md.
-- Additive-only and idempotent. EventCustomQuestion already holds data; ADD COLUMN is nullable.

ALTER TABLE "EventCustomQuestion" ADD COLUMN IF NOT EXISTS "sponsorBrandId" TEXT;

CREATE INDEX IF NOT EXISTS "EventCustomQuestion_sponsorBrandId_idx" ON "EventCustomQuestion"("sponsorBrandId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EventCustomQuestion_sponsorBrandId_fkey') THEN
    ALTER TABLE "EventCustomQuestion" ADD CONSTRAINT "EventCustomQuestion_sponsorBrandId_fkey"
      FOREIGN KEY ("sponsorBrandId") REFERENCES "SponsorBrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
