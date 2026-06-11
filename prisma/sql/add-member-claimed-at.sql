-- Migration: add Member.claimedAt
-- Generated: 2026-06-11
-- Apply with: prisma db execute --file prisma/sql/add-member-claimed-at.sql
-- NEVER run `prisma db push` — it drops Asset_searchVector_idx (DAM GIN index).
--
-- This is the ONLY statement Adam should run. The migrate diff output also
-- emits a DROP INDEX for Asset_searchVector_idx (a GIN index that lives
-- out-of-band in production, not in schema.prisma). That DROP is intentionally
-- EXCLUDED here — do not add it.

ALTER TABLE "Member" ADD COLUMN "claimedAt" TIMESTAMP(3);
