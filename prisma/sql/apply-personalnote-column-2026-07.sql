-- NoBC apply - additive column for the six-archetype reveal rebuild (2026-07).
-- Adds Application.personalNote, the reveal "Why we called you this" note written
-- fresh for new applications (legacy rows keep personalizedCopy).
--
-- Reviewed via `prisma migrate diff` (schema-to-schema): ADD COLUMN only, no
-- DROP / RENAME / ALTER TYPE. Safe to run in the Neon Console against PROD.
-- NEVER run via `prisma db push` (drops the out-of-band Asset_searchVector_idx).

ALTER TABLE "Application" ADD COLUMN "personalNote" TEXT;
