-- Additive: SponsorBrandProfile.contactEmail (recipient for sponsor recap delivery).
-- Generated 2026-06-17 via `prisma migrate diff --from-schema <HEAD> --to-schema <branch> --script`.
-- Nullable column, no backfill, no data loss. Producer is unaffected (NoBC-owned table).
--
-- Apply against Neon BEFORE deploying feat/sponsor-crud (NEVER `prisma db push`):
--   node node_modules/prisma/build/index.js db execute --file prisma/sql/add-sponsor-contact-email.sql

ALTER TABLE "SponsorBrandProfile" ADD COLUMN "contactEmail" TEXT;
