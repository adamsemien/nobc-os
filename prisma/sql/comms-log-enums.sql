-- comms-log-enums.sql  (Slice 3 — Communicate + log it)
--
-- Expands MemberEngagementEventType with the transactional-email vocabulary emitted
-- by POST /api/webhooks/resend. ADDITIVE ONLY — each statement adds one value.
-- newsletter_opened/sponsor_perk_clicked are pre-existing, unrelated values —
-- untouched, not reused (they are unwired display-label-only values today).
--
-- RUN CAVEAT (Postgres): `ALTER TYPE ... ADD VALUE` cannot run inside a
-- transaction that then uses the new value, and historically could not run inside
-- a txn block at all. Apply these as standalone statements on the UNPOOLED endpoint
-- (DIRECT_URL = Neon unpooled host; DDL must not go through PgBouncer). `npx prisma`
-- is broken in this repo — use the build entrypoint:
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/comms-log-enums.sql --schema prisma/schema.prisma
-- Do NOT wrap in BEGIN/COMMIT. Do NOT `prisma db push`. The new values are not used
-- in this same migration (POST /api/webhooks/resend uses them independently once
-- they exist). IF NOT EXISTS makes re-runs idempotent.
--
-- Producer note: additive enum value — safe for the shared Postgres instance.

ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'email_delivered';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'email_opened';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'email_clicked';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'email_bounced';
