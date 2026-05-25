-- Referral linkage, network-capital scoring, sponsor-intelligence fields, and
-- the member engagement event log.
-- Additive only: every new Member column is nullable and the new enum + table
-- are net-new, so the shared Postgres instance stays safe (Producer is unaffected).

-- CreateEnum
CREATE TYPE "MemberEngagementEventType" AS ENUM ('rsvp_confirmed', 'rsvp_cancelled', 'checked_in', 'waitlist_joined', 'waitlist_promoted', 'application_submitted', 'newsletter_opened', 'sponsor_perk_clicked');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "referredByMemberId" TEXT,
ADD COLUMN     "networkCapitalScore" DOUBLE PRECISION,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "jobFunction" TEXT,
ADD COLUMN     "seniority" TEXT,
ADD COLUMN     "companySize" TEXT,
ADD COLUMN     "ageRange" TEXT,
ADD COLUMN     "householdIncome" TEXT;

-- CreateTable
CREATE TABLE "MemberEngagementEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "eventType" "MemberEngagementEventType" NOT NULL,
    "eventId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberEngagementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Member_referredByMemberId_idx" ON "Member"("referredByMemberId");

-- CreateIndex
CREATE INDEX "MemberEngagementEvent_workspaceId_idx" ON "MemberEngagementEvent"("workspaceId");

-- CreateIndex
CREATE INDEX "MemberEngagementEvent_memberId_idx" ON "MemberEngagementEvent"("memberId");

-- CreateIndex
CREATE INDEX "MemberEngagementEvent_occurredAt_idx" ON "MemberEngagementEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_referredByMemberId_fkey" FOREIGN KEY ("referredByMemberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberEngagementEvent" ADD CONSTRAINT "MemberEngagementEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberEngagementEvent" ADD CONSTRAINT "MemberEngagementEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
