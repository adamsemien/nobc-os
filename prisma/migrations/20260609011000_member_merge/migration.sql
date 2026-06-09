-- RECONCILIATION CATCH-UP MIGRATION
-- Records the out-of-band SQL in prisma/sql/additive_member_merge.sql that was hand-applied
-- to the shared Neon instance but never tracked. Body is the EXACT idempotent SQL already
-- in prod; apply via `prisma migrate resolve --applied 20260609011000_member_merge`
-- (writes a _prisma_migrations row only — ZERO DDL). See _context/MIGRATION-RECONCILIATION-RUNBOOK.md.
-- Additive only — only ADD COLUMN / CREATE INDEX / ADD CONSTRAINT below. Producer-safe.

-- 1. Soft-merge self-relation on Member (nullable; loser -> canonical).
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "mergedIntoId" TEXT;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "mergedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Member_mergedIntoId_idx" ON "Member"("mergedIntoId");

-- FK is not idempotent via IF NOT EXISTS; guard on the catalog so a fresh-DB
-- `migrate deploy` and a re-run are both safe. ON DELETE SET NULL keeps a canonical
-- deletion from cascading away the rows merged into it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Member_mergedIntoId_fkey') THEN
    ALTER TABLE "Member"
      ADD CONSTRAINT "Member_mergedIntoId_fkey"
      FOREIGN KEY ("mergedIntoId") REFERENCES "Member"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 2. RSVP.memberId index — soft-merge re-points it, and the CRM record reads a
--    person's full RSVP history by it.
CREATE INDEX IF NOT EXISTS "RSVP_memberId_idx" ON "RSVP"("memberId");

-- 3. Member (workspaceId, phone) index — phone-based merge-candidate lookups.
CREATE INDEX IF NOT EXISTS "Member_workspaceId_phone_idx" ON "Member"("workspaceId", "phone");
