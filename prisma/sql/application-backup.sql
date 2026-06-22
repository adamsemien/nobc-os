-- application-backup.sql  (automatic application-backup feature)
--
-- Adds the BackupStatus enum and the ApplicationBackup ledger table — one row
-- per membership application, tracking its durable off-platform backup (Google
-- Drive). Membership applications are the company's most critical data asset;
-- this table is the local ledger the write-through hook + reconciliation cron
-- drive toward DONE.
--
-- ADDITIVE ONLY — no DROP, no ALTER TYPE on an existing type, no RENAME, no data
-- loss. Generated from `prisma migrate diff --from-empty --to-schema` (Prisma 7),
-- then HAND-CURATED to the ApplicationBackup statements only and made idempotent.
-- Producer shares this Neon instance — additive new objects are safe for it.
--
-- NEVER `prisma db push` (it would drop the out-of-band Asset_searchVector_idx
-- GIN index). Run on the UNPOOLED endpoint (DIRECT_URL = Neon unpooled host,
-- defined in .env.local.example; DDL must not go through PgBouncer). `npx prisma`
-- is broken in this repo — use the build entrypoint:
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/application-backup.sql --schema prisma/schema.prisma
-- Every statement is guarded (IF NOT EXISTS / duplicate_object), so re-runs are
-- safe no-ops.

-- 1. Backup status enum (idempotent).
DO $$ BEGIN
  CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Ledger table — one backup record per application.
CREATE TABLE IF NOT EXISTS "ApplicationBackup" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "destination" TEXT NOT NULL DEFAULT 'google_drive',
    "externalId" TEXT,
    "checksum" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "backedUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationBackup_pkey" PRIMARY KEY ("id")
);

-- 3. One backup row per application + the workspace/status read indexes.
CREATE UNIQUE INDEX IF NOT EXISTS "ApplicationBackup_applicationId_key" ON "ApplicationBackup"("applicationId");
CREATE INDEX IF NOT EXISTS "ApplicationBackup_workspaceId_idx" ON "ApplicationBackup"("workspaceId");
CREATE INDEX IF NOT EXISTS "ApplicationBackup_status_idx" ON "ApplicationBackup"("status");

-- 4. FK back to Application (nullable relation in schema; RESTRICT delete mirrors
--    Prisma's generated constraint). Guarded so a re-run is a no-op.
DO $$ BEGIN
  ALTER TABLE "ApplicationBackup"
    ADD CONSTRAINT "ApplicationBackup_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
