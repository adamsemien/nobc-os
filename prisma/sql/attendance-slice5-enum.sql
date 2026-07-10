-- Slice 5 (Attendance on the Person record + invited state) — additive only.
-- ONE new enum value, no table changes: `invited` on MemberEngagementEventType.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block with other
-- DDL — it MUST be its own standalone statement, run on the unpooled endpoint
-- (DIRECT_URL), same caveat as every prior enum-only migration in this repo
-- (additive_engagement_enum.sql, comms-log-enums.sql, crm-consent-floor-enums.sql,
-- crm-rbac-enums.sql, ways-in-phase-a.sql). Never `db push`, never `npx prisma`:
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/attendance-slice5-enum.sql --schema prisma/schema.prisma
--
-- "invited" is a CRM-side annotation only — the engagement row itself is the
-- invite record (no new EventInvite model; see Slice 5 recon, Option 1). It
-- carries personId always, memberId when the Person has one. Does not read,
-- write, or otherwise touch RSVP or the access-gate path.

ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'invited';
