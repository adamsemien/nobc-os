-- RECONCILIATION CATCH-UP MIGRATION
-- Records the out-of-band SQL in prisma/sql/additive_pr2_dimensions.sql that was hand-applied
-- to the shared Neon instance but never tracked. Body is the EXACT idempotent SQL already
-- in prod; apply via `prisma migrate resolve --applied 20260609012000_member_pr2_dimensions`
-- (writes a _prisma_migrations row only — ZERO DDL). See _context/MIGRATION-RECONCILIATION-RUNBOOK.md.
--
-- DELIBERATE OMISSION: the source file ended with `DROP TABLE IF EXISTS "playing_with_neon"`
-- (one-time housekeeping of a stray Neon sample table). A DROP is forbidden in authored
-- migrations for this Producer-shared instance, the table is not in schema.prisma, and it was
-- already removed out-of-band in prod — so omitting it changes neither prod state nor the
-- `migrate diff` result. It is intentionally NOT reproduced here.

-- 1. Enrichment status enum (idempotent).
DO $$ BEGIN
  CREATE TYPE "MemberEnrichmentStatus" AS ENUM ('NONE', 'PENDING', 'PARTIAL', 'COMPLETE', 'STALE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Member dimension columns (firmographic/demographic + provenance + enrichment).
--    Psychographic data is deliberately absent — see MemberPsychographics below.
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "customFields" JSONB;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "fieldProvenance" JSONB;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "companyDomain" TEXT;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "instagram" TEXT;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "enrichmentLastSynced" TIMESTAMP(3);
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "enrichmentStatus" "MemberEnrichmentStatus" NOT NULL DEFAULT 'NONE';

-- 3. Psychographics — separate 1:1 table (the physical firewall boundary).
CREATE TABLE IF NOT EXISTS "MemberPsychographics" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "archetype" TEXT,
    "archetypeScores" JSONB,
    "interests" TEXT[],
    "tasteSignals" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberPsychographics_pkey" PRIMARY KEY ("id")
);

-- 4. FieldDefinition — operator-defined firmographic/demographic fields (workspace-scoped).
CREATE TABLE IF NOT EXISTS "FieldDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "sponsorVisible" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FieldDefinition_pkey" PRIMARY KEY ("id")
);

-- 5. Indexes (memberId unique = the 1:1 guarantee + its index; workspace scoping).
CREATE UNIQUE INDEX IF NOT EXISTS "MemberPsychographics_memberId_key" ON "MemberPsychographics"("memberId");
CREATE INDEX IF NOT EXISTS "MemberPsychographics_workspaceId_idx" ON "MemberPsychographics"("workspaceId");
CREATE INDEX IF NOT EXISTS "FieldDefinition_workspaceId_idx" ON "FieldDefinition"("workspaceId");
CREATE UNIQUE INDEX IF NOT EXISTS "FieldDefinition_workspaceId_stableKey_key" ON "FieldDefinition"("workspaceId", "stableKey");

-- 6. FK: MemberPsychographics -> Member (1:1). Catalog-guarded so a fresh-DB
--    `migrate deploy` and a re-run are both safe (schema-identical to prod).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MemberPsychographics_memberId_fkey') THEN
    ALTER TABLE "MemberPsychographics"
      ADD CONSTRAINT "MemberPsychographics_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
