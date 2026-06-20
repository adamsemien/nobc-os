-- Canto migration (Stage 0): additive DAM Asset schema.
--
-- This records, as a tracked migration, schema that is ALREADY LIVE in prod
-- (applied out-of-band via `prisma db execute` from prisma/sql/canto-migration-additive.sql).
-- It is the tracked mirror of that file. Every statement is IF NOT EXISTS, so a
-- fresh `migrate deploy` reproduces prod and a re-run is a no-op.
--
-- HISTORY NOTE: prod `_prisma_migrations` is currently EMPTY (this DB was built by
-- db push / db execute; the runbook history-adopt never ran here). This migration is
-- therefore NOT yet `resolve --applied` — it will be recorded as part of the full
-- baseline-adopt (all migrations, in order) in a coordinated window. Until then it is
-- inert: deploys do not run `prisma migrate`, and the objects below already exist.
--
-- ADDITIVE ONLY. Never `db push` (it would drop the out-of-band Asset_searchVector_idx
-- GIN index). The GIN search index + trigger live in their own migration
-- (20260526180000_dam_search_vector) and are intentionally not duplicated here.

-- pgvector extension — required before the vector(768) column can be added.
CREATE EXTENSION IF NOT EXISTS vector;

-- Additive columns on Asset: provenance, content hash, EXIF + color enrichment,
-- and the pgvector CLIP embedding (768-dim, andreasjansson/clip-features).
ALTER TABLE "Asset"
  ADD COLUMN IF NOT EXISTS "sourceSystem"  TEXT,
  ADD COLUMN IF NOT EXISTS "sourceId"      TEXT,
  ADD COLUMN IF NOT EXISTS "sha256"        TEXT,
  ADD COLUMN IF NOT EXISTS "exif"          JSONB,
  ADD COLUMN IF NOT EXISTS "dominantColor" TEXT,
  ADD COLUMN IF NOT EXISTS "colorPalette"  JSONB,
  ADD COLUMN IF NOT EXISTS "embedding"     vector(768);

-- HNSW cosine index for embedding similarity search (Stage 1 semantic search).
-- Not representable in schema.prisma (Unsupported column) — expected false-drift on
-- `migrate diff --from-migrations --to-schema`; never act on the resulting DROP line.
CREATE INDEX IF NOT EXISTS "Asset_embedding_hnsw_idx"
  ON "Asset" USING hnsw ("embedding" vector_cosine_ops);

-- Idempotent re-import key: at most one row per (workspace, source, source id).
-- Partial unique index — also not representable in schema.prisma (expected false-drift).
CREATE UNIQUE INDEX IF NOT EXISTS "Asset_workspace_source_unique"
  ON "Asset" ("workspaceId", "sourceSystem", "sourceId")
  WHERE "sourceId" IS NOT NULL;

-- sha256 lookup index for exact-duplicate detection. This one IS declared in
-- schema.prisma (@@index([workspaceId, sha256])) so it does NOT show as drift.
CREATE INDEX IF NOT EXISTS "Asset_workspaceId_sha256_idx"
  ON "Asset" ("workspaceId", "sha256");
