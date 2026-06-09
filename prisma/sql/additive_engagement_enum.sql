-- additive_engagement_enum.sql  (member-intelligence PR1, commit 4)
--
-- Expands MemberEngagementEventType with the lifecycle/funnel vocabulary used by
-- the emitEvent CRM dual-write. ADDITIVE ONLY — each statement adds an enum value.
--
-- Reconciled: mirrored by tracked migration
-- prisma/migrations/20260609010000_member_engagement_enum_values.
--
-- RUN CAVEAT (Postgres): `ALTER TYPE ... ADD VALUE` cannot run inside a
-- transaction that then uses the new value, and historically could not run inside
-- a txn block at all. Apply these as standalone statements on the UNPOOLED endpoint
-- (DIRECT_URL = Neon unpooled host, defined in .env.local.example; DDL must not go through
-- PgBouncer). `npx prisma` is broken in this repo — use the build entrypoint:
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/additive_engagement_enum.sql --schema prisma/schema.prisma
-- Do NOT wrap in BEGIN/COMMIT. Do NOT `prisma db push`. The new values are not
-- used in this same migration. IF NOT EXISTS makes re-runs idempotent.
--
-- Producer note: additive enum value — safe for the shared Postgres instance.

ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'guest_created';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'application_approved';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'application_rejected';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'comp_issued';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'access_requested';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'ticket_purchased';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'plus_one_added';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'referral_made';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'enrichment_synced';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'merged';
