-- additive_contact_spine.sql  (CRM spine — roles + ContactSource provenance)
--
-- ADDITIVE ONLY. Apply with:
--   prisma db execute --file prisma/sql/additive_contact_spine.sql --schema prisma/schema.prisma
-- NEVER `prisma db push` (it would drop Asset_searchVector_idx, the out-of-band DAM
-- GIN index). Review confirms: only CREATE TYPE / ADD COLUMN / CREATE TABLE /
-- CREATE INDEX / ADD CONSTRAINT below — zero DROP / RENAME / data loss.
--
-- SEQUENCING: run AFTER PR #57's `migrate resolve` (migration-history reconciliation),
-- in a coordinated window. Producer note: Producer is a SEPARATE database (confirmed
-- 2026-06-11) and has none of these tables — this migration is Operator-internal and
-- Producer-safe regardless.
--
-- Idempotent: CREATE TYPE is guarded by DO/EXCEPTION, every other statement uses
-- IF NOT EXISTS, and the FK adds are guarded — safe to re-run.

-- 1. ContactRole enum — multi-valued roles, orthogonal to the MemberStatus lifecycle.
DO $$ BEGIN
  CREATE TYPE "ContactRole" AS ENUM ('member', 'guest', 'subscriber', 'lead', 'vendor', 'sponsor_contact');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. ContactSourceSystem enum — which system a contact/identity came from.
DO $$ BEGIN
  CREATE TYPE "ContactSourceSystem" AS ENUM ('operator', 'beehiiv', 'activecampaign', 'producer', 'csv', 'tenur');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 3. Member.roles — additive array column, default empty (existing rows unaffected).
ALTER TABLE "Member"
  ADD COLUMN IF NOT EXISTS "roles" "ContactRole"[] NOT NULL DEFAULT ARRAY[]::"ContactRole"[];

-- 4. ContactSource provenance table.
CREATE TABLE IF NOT EXISTS "ContactSource" (
  "id"           TEXT NOT NULL,
  "workspaceId"  TEXT NOT NULL,
  "memberId"     TEXT NOT NULL,
  "source"       "ContactSourceSystem" NOT NULL,
  "externalId"   TEXT,
  "syncStatus"   TEXT NOT NULL DEFAULT 'active',
  "rawSnapshot"  JSONB,
  "firstSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactSource_pkey" PRIMARY KEY ("id")
);

-- Indexes (workspace-scoped reads + the identity-resolution match lookup).
CREATE UNIQUE INDEX IF NOT EXISTS "ContactSource_workspaceId_memberId_source_key"
  ON "ContactSource"("workspaceId", "memberId", "source");
CREATE INDEX IF NOT EXISTS "ContactSource_workspaceId_idx"
  ON "ContactSource"("workspaceId");
CREATE INDEX IF NOT EXISTS "ContactSource_workspaceId_source_externalId_idx"
  ON "ContactSource"("workspaceId", "source", "externalId");
CREATE INDEX IF NOT EXISTS "ContactSource_memberId_idx"
  ON "ContactSource"("memberId");

-- Foreign keys (guarded so the file is re-runnable).
DO $$ BEGIN
  ALTER TABLE "ContactSource"
    ADD CONSTRAINT "ContactSource_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ContactSource"
    ADD CONSTRAINT "ContactSource_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "Member"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
