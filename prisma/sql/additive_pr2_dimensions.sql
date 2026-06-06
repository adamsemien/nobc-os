-- additive_pr2_dimensions.sql  (member-intelligence PR2)
--
-- ADDITIVE ONLY. Run on the UNPOOLED endpoint:
--   DATABASE_URL="$DIRECT_URL" npx prisma db execute --file prisma/sql/additive_pr2_dimensions.sql
-- NEVER `prisma db push` (would drop Asset_searchVector_idx). The GIN index is
-- intentionally NOT touched here. SQL matches the schema.prisma additions exactly,
-- so post-run `migrate diff` shows only the known Asset_searchVector_idx line.
--
-- Generated from `prisma migrate diff` then curated: GIN-index drop removed; the
-- playing_with_neon drop kept as an explicit housekeeping statement; idempotency
-- guards added (safe to re-run; the FK is the only non-idempotent statement).

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

-- 6. FK: MemberPsychographics -> Member (1:1). Not idempotent — if it throws
--    "already exists" on a re-run, treat as success and continue.
ALTER TABLE "MemberPsychographics"
  ADD CONSTRAINT "MemberPsychographics_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Housekeeping — drop the stray Neon sample table (explicit, never via db push).
DROP TABLE IF EXISTS "playing_with_neon";
