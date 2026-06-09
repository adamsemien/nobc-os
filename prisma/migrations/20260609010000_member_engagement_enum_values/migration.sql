-- RECONCILIATION CATCH-UP MIGRATION (enum catch-up — data CRITICAL #4)
-- Records the out-of-band SQL in prisma/sql/additive_engagement_enum.sql that was hand-applied
-- to the shared Neon instance but never tracked. The tracked migration
-- 20260525000000_add_referral_linkage_engagement_events created "MemberEngagementEventType"
-- with 8 values; schema.prisma + the emitEvent dual-write use 18. These 10 ADD VALUE
-- statements close that 8 -> 18 gap.
--
-- Apply via `prisma migrate resolve --applied 20260609010000_member_engagement_enum_values`
-- (writes a _prisma_migrations row only — ZERO DDL). See _context/MIGRATION-RECONCILIATION-RUNBOOK.md.
--
-- POSTGRES CAVEAT: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction that then
-- USES the new value (and historically could not run inside a txn block at all). That is why
-- these live in their OWN standalone migration and add nothing that uses the values in the
-- same file — so a fresh-DB `migrate deploy` is safe. Do NOT wrap in BEGIN/COMMIT.
-- Do NOT `prisma db push`. IF NOT EXISTS makes re-runs idempotent. Additive enum values are
-- safe for the Producer-shared Postgres instance.

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
