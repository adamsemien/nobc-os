-- Event Builder Rebuild - Phase F (mid-run addendum, ADD 1). Additive only.
-- Reviewed migrate-diff output; the two spurious out-of-band DROP INDEX lines
-- (Asset_searchVector_idx / Asset_embedding_hnsw_idx) are REMOVED as always.
--
-- Apply with:
--   node node_modules/prisma/build/index.js db execute --file prisma/sql/event-builder-phase-f.sql
-- Dev branch (ep-sweet-term) applied 2026-07-02. Production application is
-- Adam's call at cutover (checklist step 2 covers both phase files).

-- AlterTable: checkout consent capture - three separate signals on the
-- person record, never bundled, never pre-checked.
ALTER TABLE "Member" ADD COLUMN     "marketingEmailOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingEmailOptInAt" TIMESTAMP(3),
ADD COLUMN     "marketingSmsOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingSmsOptInAt" TIMESTAMP(3);
