-- Canto migration (Stage 0): additive schema for the DAM Asset table.
--
-- Adds source provenance, a content hash, EXIF + color enrichment, and the
-- pgvector CLIP embedding column (768-dim, andreasjansson/clip-features) plus its
-- ANN index and the idempotency / dedup indexes.
--
-- ADDITIVE ONLY. Apply by hand via `prisma db execute` (never `db push`, which
-- would drop the out-of-band Asset_searchVector_idx GIN index). Idempotent: every
-- statement is IF NOT EXISTS, so a re-run is a no-op. Generated from an offline
-- `prisma migrate diff` (steps 2 + 5) plus the three statements diff cannot emit
-- for an Unsupported / partial / extension case (steps 1, 3, 4).

BEGIN;

-- 1. pgvector extension - required before the vector(768) column can be added.
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Additive columns on Asset (offline migrate diff output).
ALTER TABLE "Asset"
  ADD COLUMN IF NOT EXISTS "sourceSystem"  TEXT,
  ADD COLUMN IF NOT EXISTS "sourceId"      TEXT,
  ADD COLUMN IF NOT EXISTS "sha256"        TEXT,
  ADD COLUMN IF NOT EXISTS "exif"          JSONB,
  ADD COLUMN IF NOT EXISTS "dominantColor" TEXT,
  ADD COLUMN IF NOT EXISTS "colorPalette"  JSONB,
  ADD COLUMN IF NOT EXISTS "embedding"     vector(768);

-- 3. HNSW cosine index for embedding similarity search (Stage 1 semantic search).
CREATE INDEX IF NOT EXISTS "Asset_embedding_hnsw_idx"
  ON "Asset" USING hnsw ("embedding" vector_cosine_ops);

-- 4. Idempotent re-import key: at most one row per (workspace, source, source id).
CREATE UNIQUE INDEX IF NOT EXISTS "Asset_workspace_source_unique"
  ON "Asset" ("workspaceId", "sourceSystem", "sourceId")
  WHERE "sourceId" IS NOT NULL;

-- 5. sha256 lookup index for exact-duplicate detection (offline migrate diff output).
CREATE INDEX IF NOT EXISTS "Asset_workspaceId_sha256_idx"
  ON "Asset" ("workspaceId", "sha256");

COMMIT;
