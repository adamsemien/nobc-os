-- crm-consent-floor-enums.sql  (CRM substrate, Phase 1 — consent floor)
--
-- Expands MemberEngagementEventType with the consent-floor vocabulary emitted by
-- the consent-unification writer (lib/comms/consent-sync.ts) and the suppression
-- helper (lib/comms/suppression.ts). ADDITIVE ONLY — each statement adds one value.
--
-- RUN CAVEAT (Postgres): `ALTER TYPE ... ADD VALUE` cannot run inside a
-- transaction that then uses the new value, and historically could not run inside
-- a txn block at all. Apply these as standalone statements on the UNPOOLED endpoint
-- (DIRECT_URL = Neon unpooled host; DDL must not go through PgBouncer). `npx prisma`
-- is broken in this repo — use the build entrypoint:
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/crm-consent-floor-enums.sql --schema prisma/schema.prisma
-- Do NOT wrap in BEGIN/COMMIT. Do NOT `prisma db push`. The new values are not used
-- in this same migration. IF NOT EXISTS makes re-runs idempotent.
--
-- Producer note: additive enum value — safe for the shared Postgres instance.

ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'channel_subscribed';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'channel_unsubscribed';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'suppression_added';
