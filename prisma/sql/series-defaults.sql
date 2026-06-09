-- Additive migration: EventSeries instance-default columns
--
-- Adds two nullable columns to EventSeries so a series can carry richer
-- per-instance defaults:
--   * defaultCapacity     -> mirrors Event.capacity   (Int?  -> INTEGER)
--   * defaultEventAccess  -> mirrors Event.eventAccess (Json? -> JSONB),
--                            the full gate-based access config; when set it
--                            supersedes the legacy defaultAccessMode enum.
--
-- SAFETY: Producer shares this Neon instance. This file is ADDITIVE ONLY —
-- no DROP, no ALTER TYPE, no RENAME, no data loss. Do NOT use `prisma db push`
-- (it would drop the out-of-band Asset_searchVector_idx GIN index).
-- Reconciled: mirrored by tracked migration
-- prisma/migrations/20260530170000_event_series_defaults. Run on the UNPOOLED endpoint
-- (DIRECT_URL = Neon unpooled host, defined in .env.local.example; DDL must not go through
-- PgBouncer). `npx prisma` is broken in this repo — use the build entrypoint:
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/series-defaults.sql --schema prisma/schema.prisma
-- IF NOT EXISTS makes it idempotent / safe to re-run.

ALTER TABLE "EventSeries" ADD COLUMN IF NOT EXISTS "defaultCapacity" INTEGER;
ALTER TABLE "EventSeries" ADD COLUMN IF NOT EXISTS "defaultEventAccess" JSONB;
