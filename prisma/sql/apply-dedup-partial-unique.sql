-- Migration: partial unique index to harden /apply submit idempotency
-- Generated: 2026-06-21
-- Apply with: prisma db execute --file prisma/sql/apply-dedup-partial-unique.sql
-- NEVER run `prisma db push` — it drops Asset_searchVector_idx (DAM GIN index).
-- NOT YET APPLIED — pending Adam's review (see hardening report FLAG).
--
-- Context
-- -------
-- BLOCKER 5: POST /api/apply/membership could mint a second Application row if a
-- network timeout made the applicant retry screen 0 before the first `id` came
-- back. The route already guards against this in application code (findFirst on
-- PENDING (workspaceId, email) before create, plus a P2002 recovery catch), so
-- this index is the *durable* belt-and-suspenders layer, not a prerequisite.
--
-- Why a PARTIAL index, not @@unique([workspaceId, email]) in schema.prisma
-- ----------------------------------------------------------------------
-- A plain unique on (workspaceId, email) would also block a legitimate
-- re-application after a prior APPROVED/REJECTED decision. Scoping the
-- constraint to `status = 'PENDING'` prevents duplicate *in-progress* drafts
-- while still allowing a fresh application once a decision exists. Prisma cannot
-- represent a partial / expression index on its model, so — exactly like the DAM
-- GIN index — this lives out-of-band here and is intentionally NOT in
-- schema.prisma. The route's P2002 catch makes the code correct whether or not
-- this index is live.
--
-- lower(email) matches the case-insensitive lookup the route performs.
-- Idempotent: IF NOT EXISTS guard.

CREATE UNIQUE INDEX IF NOT EXISTS "Application_workspaceId_email_pending_key"
  ON "Application" ("workspaceId", lower("email"))
  WHERE "status" = 'PENDING';
