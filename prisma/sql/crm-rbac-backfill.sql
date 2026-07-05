-- crm-rbac-backfill.sql  (CRM substrate, Phase 1.5 — Minimal RBAC) — FAIL-CLOSED backfill
--
-- RUN THIS SECOND, only AFTER crm-rbac-enums.sql has COMMITTED (it uses the new
-- 'OWNER' enum value). Data-only. No schema change.
--
-- CORRECTED 2026-07-05 against the REAL DB state Adam's rolled-back verify revealed:
--   * TWO workspaces exist in WorkspaceMember, not one:
--       PROD (target):  cmpd6xckn000004jl47xpwghx   <- all grants go here
--       SECOND (leave):  cmpfl7cbr0000wcr7ad83is8j  <- do NOT touch; see PART A
--   * clerkUserId is UNRELIABLE (adamsemien@gmail.com appears under two different
--     Clerk ids), so grants MATCH BY EMAIL (lowercased), not by clerkUserId, and this
--     file does NOT rewrite clerkUserId (identity cleanup is a separate, deliberate step).
--
-- POLICY (Adam) — in the PROD workspace only, fail closed then elevate four accounts:
--     OWNER : adamsemien@gmail.com
--     OWNER : adam@thenobadcompany.com
--     OWNER : chloe@chloechiang.com
--     ADMIN : eric@tenur.co   (Clerk MEMBER — DB column is his real role)
--   Everyone else in PROD -> READ_ONLY (Viewer). The SECOND workspace is untouched.
--
-- CLERK FLOOR: effective role = HIGHER of column and floor (never lower). The three
--   OWNERs are Clerk admins, so the org-admin floor gives them OWNER even if their
--   column doesn't resolve. Eric is a Clerk MEMBER: NO floor, so his ADMIN resolves
--   ONLY if his PROD row carries his current Clerk id. getOperatorRole matches by
--   clerkUserId and nothing links it on sign-in, so if PART A shows his row with a
--   null clerkUserId, run (5b) or he fails closed to Viewer (safe, not the ADMIN you
--   intend). The verify SELECT reads the COLUMN, so it shows Eric at ADMIN either way.
--
-- SAFE BY DEFAULT: PART B ends in ROLLBACK — it previews and persists nothing. When
--   the verify shows exactly the four rows, change ROLLBACK -> COMMIT and re-run.
-- WHERE TO RUN: Neon SQL editor or interactive psql (so SELECTs are visible). NOT
--   `prisma db execute` (it does not print query results).
--
-- =====================================================================================
-- PART A — DIAGNOSTIC (READ-ONLY; safe to run on its own, changes nothing)
-- =====================================================================================

-- A1. Every operator row across BOTH workspaces, with each workspace's identity.
SELECT wm."workspaceId", w.name AS workspace_name, w.slug, w."clerkOrgId",
       wm.email, wm."clerkUserId", wm.role
FROM "WorkspaceMember" wm
LEFT JOIN "Workspace" w ON w.id = wm."workspaceId"
ORDER BY wm."workspaceId", wm.role DESC, wm.email;

-- A2. What are the two workspaces? (name / slug / bound Clerk org / age)
SELECT id, name, slug, "clerkOrgId", "createdAt"
FROM "Workspace"
WHERE id IN ('cmpd6xckn000004jl47xpwghx', 'cmpfl7cbr0000wcr7ad83is8j')
ORDER BY "createdAt";

-- A3. Does the SECOND workspace hold any real data? (0s across the board = safe to bin)
SELECT
  (SELECT count(*) FROM "WorkspaceMember" WHERE "workspaceId" = 'cmpfl7cbr0000wcr7ad83is8j') AS operators,
  (SELECT count(*) FROM "Member"          WHERE "workspaceId" = 'cmpfl7cbr0000wcr7ad83is8j') AS members,
  (SELECT count(*) FROM "Application"      WHERE "workspaceId" = 'cmpfl7cbr0000wcr7ad83is8j') AS applications,
  (SELECT count(*) FROM "Event"            WHERE "workspaceId" = 'cmpfl7cbr0000wcr7ad83is8j') AS events;

-- =====================================================================================
-- PART B — BACKFILL (PROD workspace cmpd6xckn000004jl47xpwghx ONLY; preview-first)
-- =====================================================================================

BEGIN;

-- (1) FAIL CLOSED: every PROD operator down to the lowest tier first. Scoped so the
--     SECOND workspace is never touched.
UPDATE "WorkspaceMember" SET role = 'READ_ONLY'
WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx';

-- (2) OWNER — adamsemien@gmail.com  (email-keyed; clerkUserId left as-is)
INSERT INTO "WorkspaceMember" (id, "workspaceId", email, role, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', lower('adamsemien@gmail.com'), 'OWNER', now(), now())
ON CONFLICT ("workspaceId", email) DO UPDATE SET role = 'OWNER';

-- (3) OWNER — adam@thenobadcompany.com
INSERT INTO "WorkspaceMember" (id, "workspaceId", email, role, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', lower('adam@thenobadcompany.com'), 'OWNER', now(), now())
ON CONFLICT ("workspaceId", email) DO UPDATE SET role = 'OWNER';

-- (4) OWNER — chloe@chloechiang.com
INSERT INTO "WorkspaceMember" (id, "workspaceId", email, role, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', lower('chloe@chloechiang.com'), 'OWNER', now(), now())
ON CONFLICT ("workspaceId", email) DO UPDATE SET role = 'OWNER';

-- (5) ADMIN — eric@tenur.co  (Clerk MEMBER, no floor; needs his Clerk id to resolve)
INSERT INTO "WorkspaceMember" (id, "workspaceId", email, role, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', lower('eric@tenur.co'), 'ADMIN', now(), now())
ON CONFLICT ("workspaceId", email) DO UPDATE SET role = 'ADMIN';

-- (5b) ONLY IF A1 showed eric@tenur.co in PROD with a null clerkUserId (or no row):
--      set his current Clerk id so his ADMIN resolves. Replace ERIC_CLERK_USER_ID.
-- UPDATE "WorkspaceMember" SET "clerkUserId" = 'ERIC_CLERK_USER_ID'
-- WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND email = lower('eric@tenur.co');

-- (opt) IDENTITY CLEANUP — align adamsemien@gmail.com's PROD row to your real Clerk id
--       (A1 may show a stale user_3DfnR5...). Not required (org-admin floor covers you);
--       do it if you want the column to resolve for your real session too.
-- UPDATE "WorkspaceMember" SET "clerkUserId" = 'user_3EEcOi5IB0LYQavOrNoxZbndux8'
-- WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND email = lower('adamsemien@gmail.com');

-- (6) VERIFY — operator-level rows in PROD ONLY. Expect EXACTLY FOUR: three OWNER
--     (adamsemien@gmail.com, adam@thenobadcompany.com, chloe@chloechiang.com) and one
--     ADMIN (eric@tenur.co). Anyone else here = STOP before COMMIT.
SELECT "workspaceId", email, "clerkUserId", role
FROM "WorkspaceMember"
WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx'
  AND role IN ('OWNER', 'ADMIN', 'STAFF')
ORDER BY role DESC, email;

ROLLBACK;  -- <-- SAFE DEFAULT: previews only, persists nothing.
           --     Change to COMMIT and re-run ONLY after (6) shows exactly those four.
