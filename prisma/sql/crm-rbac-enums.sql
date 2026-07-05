-- crm-rbac-enums.sql  (CRM substrate, Phase 1.5 — Minimal RBAC)
--
-- ADDITIVE ONLY. Adds one value to OperatorRole (OWNER) and one to
-- MemberEngagementEventType (role_changed). No new table/column, zero DROP, zero
-- ALTER of an existing table. Safe for the shared Postgres. Does not touch
-- Asset_searchVector_idx, the sponsor_audience_member VIEW, or any HNSW index.
--
-- RUN THIS FIRST, before the backfill (crm-rbac-backfill.sql): Postgres cannot use
-- a new enum value in the same transaction it is added, so the backfill's
-- `... = 'OWNER'` must run only after this file has COMMITTED.
--
-- RUN CAVEAT (Postgres): `ALTER TYPE ... ADD VALUE` cannot run inside a txn block.
-- Apply on the UNPOOLED endpoint (DIRECT_URL); DDL must not go through PgBouncer:
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/crm-rbac-enums.sql --schema prisma/schema.prisma
-- Do NOT wrap in BEGIN/COMMIT. Do NOT `prisma db push`. IF NOT EXISTS makes re-runs idempotent.

ALTER TYPE "OperatorRole" ADD VALUE IF NOT EXISTS 'OWNER';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'role_changed';
