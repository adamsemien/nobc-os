-- crm-rbac-backfill.sql  (CRM substrate, Phase 1.5 — Minimal RBAC) — FAIL-CLOSED backfill
--
-- RUN THIS SECOND, only AFTER crm-rbac-enums.sql has COMMITTED (it uses the new
-- 'OWNER' enum value). Data-only: it updates WorkspaceMember.role. No schema change.
--
-- POLICY (Adam, 2026-07-05 — four-member Clerk org, roles reconciled in Clerk):
--   FAIL CLOSED. Set EVERY operator to the lowest tier (READ_ONLY / "Viewer") first,
--   then elevate ONLY the four named accounts:
--     OWNER : adamsemien@gmail.com      (Clerk Admin, user_3EEcOi5IB0LYQavOrNoxZbndux8)
--     OWNER : adam@thenobadcompany.com  (Clerk Admin, Clerk id not supplied — floor covers)
--     OWNER : chloe@chloechiang.com     (Clerk Admin, user_3E3X3Mdfa34uODgC7bgDcEVQgIU)
--     ADMIN : eric@tenur.co             (Clerk MEMBER — DB column is his real role)
--   Nobody else ends up with operator-level (OWNER/ADMIN/STAFF) access.
--
--   Matching Clerk roles (Adam sets these in the Clerk dashboard, not here):
--     the three OWNERs are Clerk Admins (floor -> OWNER); Eric is a Clerk MEMBER
--     (floor -> Viewer), so his access comes ENTIRELY from the DB column below.
--
-- SCOPE — this file ONLY touches WorkspaceMember, the OPERATOR table. Members,
--   applicants, and imported contacts are NOT operators and are untouched.
--
-- clerkUserId MATTERS: getOperatorRole() matches strictly by clerkUserId, and nothing
--   links it onto a row on sign-in. So a column grant resolves at runtime ONLY if the
--   row carries the person's Clerk id.
--     - The three OWNERs are Clerk Admins, so the org-admin FLOOR gives them OWNER even
--       if their column doesn't resolve — they are safe regardless.
--     - ERIC IS A CLERK MEMBER: no floor. His ADMIN resolves ONLY if his row carries his
--       Clerk id. His upsert below PRESERVES an existing clerkUserId; if his row has none,
--       run step (5b) with his Clerk id or he will fail closed to Viewer (safe, but not
--       the intended ADMIN). The verify SELECT reads the column, so it will show him at
--       ADMIN even when the grant would not resolve — do not treat the SELECT alone as
--       proof Eric resolves to ADMIN.
--
-- CLERK-FLOOR CAVEAT: effective role = HIGHER of column and floor (never lower). The
--   floor raises ANY Clerk org admin to OWNER, invisible to SQL. Complete owner set =
--   (rows with role='OWNER') UNION (Clerk org admins). Confirm in the Clerk dashboard
--   that your org admins are exactly the three OWNERs above and Eric is a MEMBER.
--   (Chloe is now a Clerk Admin, so the floor pins her at OWNER: she can NO LONGER be
--   demoted from the Team UI — change her in Clerk first if you ever need to.)
--
-- SAFE BY DEFAULT: this file ends in ROLLBACK, so running it PREVIEWS the outcome and
--   persists NOTHING. Read the final SELECT; if — and only if — it shows exactly the
--   four accounts above and nobody else, change the last line ROLLBACK -> COMMIT and
--   re-run to persist.
--
-- WHERE TO RUN: the Neon SQL editor or an interactive `psql "$DIRECT_URL"` session, so
--   the SELECTs are VISIBLE and you control COMMIT/ROLLBACK. Do NOT run this through
--   `prisma db execute` — it does not print query results, so you'd commit blind.

BEGIN;

-- (0) DIAGNOSTIC — current operators + workspace(s). Confirm the workspace, see who
--     you're demoting to Viewer, and CHECK eric@tenur.co's clerkUserId: if it is null
--     or he has no row, his ADMIN will not resolve until you run step (5b).
SELECT "workspaceId", email, "clerkUserId", role
FROM "WorkspaceMember"
ORDER BY "workspaceId", role DESC, email;

-- (1) FAIL CLOSED: every operator down to the lowest tier first.
--     NOTE: no WHERE = all workspaces. Single-tenant today (Tenant Zero = NoBC). If (0)
--     shows more than one workspace, add WHERE "workspaceId" = '<NoBC id>' here and on
--     each upsert's Workspace subquery below.
UPDATE "WorkspaceMember" SET role = 'READ_ONLY';

-- (2) OWNER — adamsemien@gmail.com (Clerk id known; also OWNER via floor).
INSERT INTO "WorkspaceMember" (id, "workspaceId", email, "clerkUserId", role, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text,
        (SELECT id FROM "Workspace" ORDER BY "createdAt" ASC LIMIT 1),
        lower('adamsemien@gmail.com'), 'user_3EEcOi5IB0LYQavOrNoxZbndux8', 'OWNER', now(), now())
ON CONFLICT ("workspaceId", email)
  DO UPDATE SET role = 'OWNER',
    "clerkUserId" = COALESCE(EXCLUDED."clerkUserId", "WorkspaceMember"."clerkUserId");

-- (3) OWNER — adam@thenobadcompany.com (Clerk id not supplied; OWNER via the org-admin
--     floor. clerkUserId left null on insert, preserved if a row already links it.)
INSERT INTO "WorkspaceMember" (id, "workspaceId", email, "clerkUserId", role, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text,
        (SELECT id FROM "Workspace" ORDER BY "createdAt" ASC LIMIT 1),
        lower('adam@thenobadcompany.com'), NULL, 'OWNER', now(), now())
ON CONFLICT ("workspaceId", email)
  DO UPDATE SET role = 'OWNER',
    "clerkUserId" = COALESCE(EXCLUDED."clerkUserId", "WorkspaceMember"."clerkUserId");

-- (4) OWNER — chloe@chloechiang.com (Clerk id known; also OWNER via floor).
INSERT INTO "WorkspaceMember" (id, "workspaceId", email, "clerkUserId", role, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text,
        (SELECT id FROM "Workspace" ORDER BY "createdAt" ASC LIMIT 1),
        lower('chloe@chloechiang.com'), 'user_3E3X3Mdfa34uODgC7bgDcEVQgIU', 'OWNER', now(), now())
ON CONFLICT ("workspaceId", email)
  DO UPDATE SET role = 'OWNER',
    "clerkUserId" = COALESCE(EXCLUDED."clerkUserId", "WorkspaceMember"."clerkUserId");

-- (5) ADMIN — eric@tenur.co (Clerk MEMBER, no floor). Preserves an existing clerkUserId;
--     insert leaves it null. HIS ADMIN RESOLVES ONLY IF THE ROW CARRIES HIS CLERK ID.
INSERT INTO "WorkspaceMember" (id, "workspaceId", email, "clerkUserId", role, "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text,
        (SELECT id FROM "Workspace" ORDER BY "createdAt" ASC LIMIT 1),
        lower('eric@tenur.co'), NULL, 'ADMIN', now(), now())
ON CONFLICT ("workspaceId", email)
  DO UPDATE SET role = 'ADMIN',
    "clerkUserId" = COALESCE(EXCLUDED."clerkUserId", "WorkspaceMember"."clerkUserId");

-- (5b) ONLY IF the diagnostic showed eric@tenur.co with a null clerkUserId (or no row):
--      set his Clerk id so his ADMIN actually resolves. Replace ERIC_CLERK_USER_ID and
--      uncomment. Without this, Eric fails closed to Viewer.
-- UPDATE "WorkspaceMember" SET "clerkUserId" = 'ERIC_CLERK_USER_ID'
-- WHERE email = lower('eric@tenur.co');

-- (6) VERIFY — the operator-level (OWNER/ADMIN/STAFF) list after the backfill. Expect
--     EXACTLY FOUR rows: three OWNER (both Adam accounts + Chloe) and one ADMIN (Eric),
--     nobody else. Anyone else here = STOP before COMMIT. (Reads the column only, so an
--     ADMIN row for Eric here still needs his clerkUserId to resolve — see (5)/(5b).)
SELECT "workspaceId", email, "clerkUserId", role
FROM "WorkspaceMember"
WHERE role IN ('OWNER', 'ADMIN', 'STAFF')
ORDER BY role DESC, email;

ROLLBACK;  -- <-- SAFE DEFAULT: previews only, persists nothing.
           --     Change to COMMIT and re-run ONLY after (6) shows exactly those four.
