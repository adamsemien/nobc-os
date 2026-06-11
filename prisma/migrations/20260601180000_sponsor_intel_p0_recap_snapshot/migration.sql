-- RECONCILIATION CATCH-UP MIGRATION
-- Records the out-of-band SQL in prisma/sql/sponsor-intel-p0.sql that was hand-applied
-- to the shared Neon instance but never tracked. Body is the EXACT idempotent SQL already
-- in prod; apply via
--   `prisma migrate resolve --applied 20260601180000_sponsor_intel_p0_recap_snapshot`
-- (writes a _prisma_migrations row only — ZERO DDL). See _context/MIGRATION-RECONCILIATION-RUNBOOK.md.
-- Additive-only and idempotent. Producer shares this Postgres instance.

-- SponsorBrandProfile: Sponsor Brief intake fields (all nullable → additive, no backfill/rewrite)
ALTER TABLE "SponsorBrandProfile" ADD COLUMN IF NOT EXISTS "declaredObjectives" TEXT;
ALTER TABLE "SponsorBrandProfile" ADD COLUMN IF NOT EXISTS "targetPersonaCriteria" JSONB;
ALTER TABLE "SponsorBrandProfile" ADD COLUMN IF NOT EXISTS "rightsFeeCents" INTEGER;

-- RecapSnapshot: reproducible computed-metrics snapshot behind each recap PDF (new table)
CREATE TABLE IF NOT EXISTS "RecapSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sponsorBrandId" TEXT,
    "metrics" JSONB NOT NULL,
    "mediaValueInputs" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBySession" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecapSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RecapSnapshot_workspaceId_idx" ON "RecapSnapshot"("workspaceId");
CREATE INDEX IF NOT EXISTS "RecapSnapshot_eventId_idx" ON "RecapSnapshot"("eventId");
CREATE INDEX IF NOT EXISTS "RecapSnapshot_sponsorBrandId_idx" ON "RecapSnapshot"("sponsorBrandId");

-- Foreign keys (idempotent via pg_constraint catalog check; target only the new empty table)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecapSnapshot_workspaceId_fkey') THEN
    ALTER TABLE "RecapSnapshot" ADD CONSTRAINT "RecapSnapshot_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecapSnapshot_sponsorBrandId_fkey') THEN
    ALTER TABLE "RecapSnapshot" ADD CONSTRAINT "RecapSnapshot_sponsorBrandId_fkey"
      FOREIGN KEY ("sponsorBrandId") REFERENCES "SponsorBrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
