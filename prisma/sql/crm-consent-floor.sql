-- crm-consent-floor.sql  (CRM substrate, Phase 1 — consent floor)
--
-- Reproduced from NoBadOS__spec__crm-substrate__2026-07-03.md §1 (Appendix A).
-- ADDITIVE ONLY. Creates 4 NEW enums + 2 NEW tables (ChannelSubscription,
-- SuppressionEntry) + their indexes + FKs. Touches NOTHING that already exists:
-- zero DROP, zero ALTER of an existing table, does not touch Asset_searchVector_idx,
-- the sponsor_audience_member VIEW, or any HNSW index. Safe for the shared Postgres.
--
-- Verified against `prisma migrate diff` (datamodel -> datamodel vs main). The only
-- hand-added line the diff does not emit is the `stream` CHECK constraint at the end
-- (Prisma cannot represent CHECK); see the NULL-distinct note there.
--
-- The enum ADD VALUEs for MemberEngagementEventType are in the SEPARATE file
-- crm-consent-floor-enums.sql (ALTER TYPE ... ADD VALUE cannot share a txn with the
-- value's use and must run standalone).
--
-- RUN (unpooled endpoint; DDL must not go through PgBouncer):
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/crm-consent-floor.sql --schema prisma/schema.prisma
-- Do NOT `prisma db push`. Do NOT `npx prisma`.

-- CreateEnum
CREATE TYPE "CommChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED', 'PENDING', 'CLEANED', 'NEVER_SUBSCRIBED');

-- CreateEnum
CREATE TYPE "ConsentBasis" AS ENUM ('EXPRESS_OPTIN', 'IMPLIED_RELATIONSHIP', 'IMPORTED_LEGACY', 'OPERATOR_ADDED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('UNSUBSCRIBE', 'HARD_BOUNCE', 'SPAM_COMPLAINT', 'CARRIER_REJECT', 'MANUAL_BLOCK', 'GLOBAL_EXCLUDE', 'INVALID');

-- CreateTable
CREATE TABLE "ChannelSubscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "stream" TEXT NOT NULL DEFAULT '*',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "consentBasis" "ConsentBasis" NOT NULL DEFAULT 'UNKNOWN',
    "consentText" TEXT,
    "consentSource" TEXT,
    "consentIp" TEXT,
    "consentAt" TIMESTAMP(3),
    "externalId" TEXT,
    "source" "ContactSourceSystem",
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "identifier" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "source" TEXT,
    "memberId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelSubscription_workspaceId_idx" ON "ChannelSubscription"("workspaceId");

-- CreateIndex
CREATE INDEX "ChannelSubscription_memberId_idx" ON "ChannelSubscription"("memberId");

-- CreateIndex
CREATE INDEX "ChannelSubscription_workspaceId_channel_status_idx" ON "ChannelSubscription"("workspaceId", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelSubscription_workspaceId_memberId_channel_stream_key" ON "ChannelSubscription"("workspaceId", "memberId", "channel", "stream");

-- CreateIndex
CREATE INDEX "SuppressionEntry_workspaceId_channel_idx" ON "SuppressionEntry"("workspaceId", "channel");

-- CreateIndex
CREATE INDEX "SuppressionEntry_memberId_idx" ON "SuppressionEntry"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionEntry_workspaceId_channel_identifier_key" ON "SuppressionEntry"("workspaceId", "channel", "identifier");

-- AddForeignKey
ALTER TABLE "ChannelSubscription" ADD CONSTRAINT "ChannelSubscription_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelSubscription" ADD CONSTRAINT "ChannelSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionEntry" ADD CONSTRAINT "SuppressionEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionEntry" ADD CONSTRAINT "SuppressionEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK: stream is never null (decision 3). The column is already NOT NULL with
-- DEFAULT '*', so this is belt-and-suspenders. It closes the NULL-distinct gotcha
-- on the unique index: Postgres treats NULLs as distinct, so a nullable column in
-- @@unique([workspaceId, memberId, channel, stream]) would let two "same" rows
-- coexist with NULL stream and defeat the one-subscription-per-(member,channel)
-- invariant. All four unique-tuple columns are NOT NULL (workspaceId, memberId,
-- channel, stream), so no NULL can enter the tuple — the gotcha is fully closed.
ALTER TABLE "ChannelSubscription" ADD CONSTRAINT "ChannelSubscription_stream_not_null_chk" CHECK ("stream" IS NOT NULL);
