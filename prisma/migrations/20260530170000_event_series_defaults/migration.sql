-- RECONCILIATION CATCH-UP MIGRATION
-- Records the out-of-band SQL in prisma/sql/series-defaults.sql that was hand-applied
-- to the shared Neon instance but never tracked. Body is the EXACT idempotent SQL already
-- in prod; apply via `prisma migrate resolve --applied 20260530170000_event_series_defaults`
-- (writes a _prisma_migrations row only — ZERO DDL). See _context/MIGRATION-RECONCILIATION-RUNBOOK.md.

-- Additive: EventSeries instance-default columns
--   * defaultCapacity     -> mirrors Event.capacity   (Int?  -> INTEGER)
--   * defaultEventAccess  -> mirrors Event.eventAccess (Json? -> JSONB), the full
--                            gate-based access config; when set it supersedes the
--                            legacy defaultAccessMode enum.
-- ADDITIVE ONLY — no DROP, no ALTER TYPE, no RENAME, no data loss. IF NOT EXISTS = idempotent.

ALTER TABLE "EventSeries" ADD COLUMN IF NOT EXISTS "defaultCapacity" INTEGER;
ALTER TABLE "EventSeries" ADD COLUMN IF NOT EXISTS "defaultEventAccess" JSONB;
