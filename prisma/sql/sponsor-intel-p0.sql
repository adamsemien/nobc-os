-- Sponsor Intelligence — Phase 0 additive migration
-- Source: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`,
-- then HAND-REVIEWED. The ONLY statement removed was:
--     DROP INDEX "Asset_searchVector_idx";
-- That is FALSE drift: the DAM full-text GIN index lives only in prod (created out-of-band by
-- prisma/sql/dam-search-vector.sql) and cannot be represented in schema.prisma's
-- Unsupported("tsvector") type. NEVER drop it. Producer shares this Postgres instance.
-- Everything below is additive-only and idempotent (safe to re-run).

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
