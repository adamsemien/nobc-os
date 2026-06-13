-- Additive: per-event member-page styling overrides.
-- Adds Event.pageStyle (nullable JSONB). null = brand defaults (no behavior change
-- for existing events). Validated in app code by lib/page-style.ts.
--
-- Apply with:
--   node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/additive_event_page_style.sql --schema prisma/schema.prisma
--
-- Additive only: no DROP, no ALTER TYPE, no RENAME. IF NOT EXISTS makes it idempotent.
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "pageStyle" JSONB;
