-- crm-rbac-backfill.sql  (CRM substrate, Phase 1.5 — Minimal RBAC)
--
-- RUN THIS SECOND, only AFTER crm-rbac-enums.sql has COMMITTED (it uses the new
-- 'OWNER' value). Data-only: it updates WorkspaceMember.role. No schema change.
--
-- WHAT IT CHANGES (read-only note):
--   1. Every current ADMIN operator -> OWNER. ADMIN is today the top role with
--      FULL access; under the 4-tier model ADMIN becomes the middle tier, so
--      promoting current ADMINs to OWNER PRESERVES exactly today's access — nobody
--      loses anything on deploy. The (now-empty) ADMIN tier is assigned going
--      forward via Settings > Team.
--   2. Adam (Clerk user_3EEcOi5IB0LYQavOrNoxZbndux8) -> OWNER explicitly. This is
--      redundant with rule 1 if he has an ADMIN row, and is the belt-and-suspenders
--      guarantee that he is OWNER regardless.
--   STAFF and READ_ONLY (Viewer) rows are left untouched.
--
-- LOCKOUT: Adam also resolves to OWNER via the Clerk-org floor (org admin -> OWNER,
-- lib/operator-role.ts), so he cannot be locked out even if this backfill were
-- skipped or his row were absent. Verify before you COMMIT:
--     SELECT "clerkUserId", email, role FROM "WorkspaceMember"
--     WHERE "clerkUserId" = 'user_3EEcOi5IB0LYQavOrNoxZbndux8';
--   -> expect role = 'OWNER'.
--
-- RUN (unpooled endpoint):
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/crm-rbac-backfill.sql --schema prisma/schema.prisma

UPDATE "WorkspaceMember" SET role = 'OWNER' WHERE role = 'ADMIN';
UPDATE "WorkspaceMember" SET role = 'OWNER' WHERE "clerkUserId" = 'user_3EEcOi5IB0LYQavOrNoxZbndux8';
