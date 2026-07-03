-- Event Builder Rebuild - Phase A (additive only).
-- Reviewed migrate-diff output with the two spurious DROP INDEX lines REMOVED
-- (Asset_searchVector_idx / Asset_embedding_hnsw_idx live out-of-band and are
-- invisible to the Prisma schema - never drop them; see CLAUDE.md).
--
-- Apply with:
--   node node_modules/prisma/build/index.js db execute --file prisma/sql/event-builder-phase-a.sql
-- Dev branch (ep-sweet-term) applied 2026-07-02. Production application is
-- Adam's call at cutover, dry-run first.

-- AlterEnum
ALTER TYPE "ProofMechanism" ADD VALUE 'COMP_CODE';
