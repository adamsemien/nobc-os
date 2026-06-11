-- additive_member_merge.sql  (member-intelligence PR1, commit 5 schema)
--
-- ADDITIVE ONLY. Reconciled: mirrored by tracked migration
-- prisma/migrations/20260609011000_member_merge. Run on the UNPOOLED endpoint
-- (DIRECT_URL = Neon unpooled host, defined in .env.local.example; DDL must not go through
-- PgBouncer). `npx prisma` is broken in this repo — use the build entrypoint:
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/additive_member_merge.sql --schema prisma/schema.prisma
-- NEVER `prisma db push` (it would drop Asset_searchVector_idx, the out-of-band
-- DAM GIN index). Review confirms: only ADD COLUMN / CREATE INDEX / ADD CONSTRAINT
-- below — zero DROP / ALTER TYPE / RENAME / data loss.
--
-- Producer note: additive columns + indexes on shared tables are SELECT-safe.
-- The soft-merge that re-points RSVP.memberId (commit 5 code) is a separate
-- concern — see the Producer-coordination gate before that code ships.

-- 1. Soft-merge self-relation on Member (nullable; loser -> canonical).
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "mergedIntoId" TEXT;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "mergedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Member_mergedIntoId_idx" ON "Member"("mergedIntoId");

-- FK is not idempotent via IF NOT EXISTS; run once. ON DELETE SET NULL keeps a
-- canonical deletion from cascading away the rows merged into it.
ALTER TABLE "Member"
  ADD CONSTRAINT "Member_mergedIntoId_fkey"
  FOREIGN KEY ("mergedIntoId") REFERENCES "Member"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. RSVP.memberId index — soft-merge re-points it, and the PR3 CRM record reads
--    a person's full RSVP history by it. RSVP is currently indexed on
--    workspaceId/eventId/orderId/tierId but NOT memberId.
CREATE INDEX IF NOT EXISTS "RSVP_memberId_idx" ON "RSVP"("memberId");

-- 3. Member (workspaceId, phone) index — phone-based merge-candidate lookups.
CREATE INDEX IF NOT EXISTS "Member_workspaceId_phone_idx" ON "Member"("workspaceId", "phone");
