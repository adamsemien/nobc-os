-- RECONCILIATION CATCH-UP MIGRATION
-- Records the out-of-band SQL in prisma/sql/dam-search-vector.sql that was hand-applied
-- to the shared Neon instance but never tracked. Body is the EXACT idempotent SQL already
-- in prod; apply via `prisma migrate resolve --applied 20260526180000_dam_search_vector`
-- (writes a _prisma_migrations row only — ZERO DDL). See _context/MIGRATION-RECONCILIATION-RUNBOOK.md.
--
-- NOTE: the Asset_searchVector_idx GIN index below is intentional out-of-band state.
-- Prisma cannot represent a GIN index on the Unsupported("tsvector") column, so a later
-- `migrate diff` will report a single DROP INDEX "Asset_searchVector_idx" line — that is
-- EXPECTED FALSE DRIFT (see CLAUDE.md "Schema changes: never db push"). Never drop it.

-- DAM full-text search: maintain Asset.searchVector from text fields via a
-- trigger, GIN-index it, and backfill existing rows. Applied after `db push`
-- creates the (nullable) searchVector column. Idempotent.

CREATE OR REPLACE FUNCTION dam_asset_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" := to_tsvector('simple',
    coalesce(NEW."filename", '') || ' ' ||
    coalesce(array_to_string(NEW."tags", ' '), '') || ' ' ||
    coalesce(array_to_string(NEW."aiTags", ' '), '') || ' ' ||
    coalesce(NEW."sponsorName", '')
  );
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS dam_asset_search_vector_trg ON "Asset";
CREATE TRIGGER dam_asset_search_vector_trg
  BEFORE INSERT OR UPDATE OF "filename", "tags", "aiTags", "sponsorName"
  ON "Asset" FOR EACH ROW EXECUTE FUNCTION dam_asset_search_vector();

CREATE INDEX IF NOT EXISTS "Asset_searchVector_idx" ON "Asset" USING GIN ("searchVector");

-- Backfill existing rows (no-op on an empty table).
UPDATE "Asset" SET "searchVector" = to_tsvector('simple',
  coalesce("filename", '') || ' ' ||
  coalesce(array_to_string("tags", ' '), '') || ' ' ||
  coalesce(array_to_string("aiTags", ' '), '') || ' ' ||
  coalesce("sponsorName", '')
);
