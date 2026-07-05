-- crm-rbac-backfill.sql  (CRM substrate, Phase 1.5 — Minimal RBAC) — FAIL-CLOSED backfill
--
-- RUN THIS SECOND, only AFTER crm-rbac-enums.sql has COMMITTED (it uses the new
-- 'OWNER' enum value). Data-only: it updates WorkspaceMember.role. No schema change.
--
-- POLICY (Adam, 2026-07-05 — supersedes the earlier "all ADMIN -> OWNER" version):
--   FAIL CLOSED. Set EVERY operator to the lowest tier (READ_ONLY / "Viewer") first,
--   then elevate ONLY the two named accounts to OWNER:
--     - Adam  (adamsemien@gmail.com   / Clerk user_3EEcOi5IB0LYQavOrNoxZbndux8)
--     - Chloe (chloe@chloechiang.com  / Clerk user_3E3X3Mdfa34uODgC7bgDcEVQgIU)
--   Nobody else ends up with operator-level (OWNER/ADMIN/STAFF) access.
--
-- SCOPE — this file ONLY touches WorkspaceMember, the OPERATOR table. Members,
--   applicants, and imported contacts are NOT operators (no WorkspaceMember row, no
--   OperatorRole at all), so they are already closed out and this file cannot grant
--   them access.
--
-- WHY WE WRITE clerkUserId (not just email): getOperatorRole() matches strictly by
--   clerkUserId. Nothing in the app links clerkUserId onto an invited row on sign-in,
--   so an email-only OWNER grant would resolve to NULL and fall back to the floor.
--   The upserts below set clerkUserId so each grant actually resolves.
--
-- CLERK-FLOOR CAVEAT (read before you trust the verify SELECT):
--   Effective role = the HIGHER of this column and the Clerk-org floor
--   (lib/operator-role.ts). The floor raises ANY Clerk org admin to OWNER at runtime,
--   regardless of this column, and SQL cannot see that. So the COMPLETE owner set =
--   (rows below with role='OWNER') UNION (all Clerk org admins). To be truly
--   fail-closed, your Clerk org admins must be exactly {Adam} (and Chloe only if you
--   deliberately want her floored). Recommendation: keep Chloe as Clerk org:member so
--   this column is her single source of truth and you can demote her from the Team UI.
--
-- SAFE BY DEFAULT: this file ends in ROLLBACK, so running it PREVIEWS the outcome and
--   persists NOTHING. Read the final SELECT; if — and only if — it shows exactly Adam
--   + Chloe as OWNER and nobody else at OWNER/ADMIN/STAFF, change the last line
--   ROLLBACK -> COMMIT and re-run to persist.
--
-- WHERE TO RUN: the Neon SQL editor or an interactive `psql "$DIRECT_URL"` session,
--   so the SELECTs are VISIBLE and you control COMMIT/ROLLBACK. Do NOT run this through
--   `prisma db execute` — it does not print query results, so you'd commit blind.
--   (`prisma db execute` is fine for the enum file, which returns no rows.)

BEGIN;

-- (0) DIAGNOSTIC — the current operators and which workspace(s) they live in. Use it
--     to confirm the workspace and to SEE who you're demoting to Viewer (any current
--     STAFF/ADMIN loses write access until an OWNER re-grants them via Settings > Team).
--     You may see a stale 'chloe@thenobadcompany.com' placeholder here from an earlier
--     seed — harmless; step (1) drops it to Viewer. Delete it later from the Team UI.
SELECT "workspaceId", email, "clerkUserId", role
FROM "WorkspaceMember"
ORDER BY "workspaceId", role DESC, email;

-- (1) FAIL CLOSED: every operator down to the lowest tier first.
--     NOTE: no WHERE = all workspaces. Single-tenant today (Tenant Zero = NoBC), so this
--     is correct. If (0) shows more than one workspace, add
--     WHERE "workspaceId" = '<the NoBC workspace id>' here and on (2) and (3).
UPDATE "WorkspaceMember" SET role = 'READ_ONLY';

-- (2) ELEVATE Adam. Upsert by email so he ends up with an explicit OWNER row that both
--     appears in the verify SELECT and lets the Team UI's last-owner guard count him
--     (the guard counts explicit OWNER rows, not the Clerk floor). Sets clerkUserId so
--     the grant resolves. He is also OWNER via the org-admin floor (belt-and-suspenders).
INSERT INTO "WorkspaceMember" (id, "workspaceId", email, "clerkUserId", role, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  (SELECT id FROM "Workspace" ORDER BY "createdAt" ASC LIMIT 1),  -- oldest = NoBC (single-tenant)
  lower('adamsemien@gmail.com'),
  'user_3EEcOi5IB0LYQavOrNoxZbndux8',
  'OWNER', now(), now()
)
ON CONFLICT ("workspaceId", email)
  DO UPDATE SET role = 'OWNER', "clerkUserId" = EXCLUDED."clerkUserId";

-- (3) ELEVATE Chloe. Same upsert-by-email; writes her real Clerk id onto the OWNER row
--     (supersedes any stale placeholder invite). Keep her as Clerk org:member so this
--     row is her single source of truth and you can drop her to ADMIN by clicking later.
INSERT INTO "WorkspaceMember" (id, "workspaceId", email, "clerkUserId", role, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::text,
  (SELECT id FROM "Workspace" ORDER BY "createdAt" ASC LIMIT 1),
  lower('chloe@chloechiang.com'),
  'user_3E3X3Mdfa34uODgC7bgDcEVQgIU',
  'OWNER', now(), now()
)
ON CONFLICT ("workspaceId", email)
  DO UPDATE SET role = 'OWNER', "clerkUserId" = EXCLUDED."clerkUserId";

-- (4) VERIFY — the COMPLETE operator-level (OWNER/ADMIN/STAFF) list after the backfill.
--     Expect EXACTLY: adamsemien@gmail.com + chloe@chloechiang.com, both OWNER, and
--     nobody at ADMIN or STAFF. Anyone else here = STOP and investigate before COMMIT.
--     (Reminder: also confirm in the Clerk dashboard that your org admins = {Adam}.)
SELECT "workspaceId", email, "clerkUserId", role
FROM "WorkspaceMember"
WHERE role IN ('OWNER', 'ADMIN', 'STAFF')
ORDER BY role DESC, email;

ROLLBACK;  -- <-- SAFE DEFAULT: previews only, persists nothing.
           --     Change to COMMIT and re-run ONLY after (4) shows exactly Adam + Chloe.
