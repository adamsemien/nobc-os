-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AiApplicationRecommendation" AS ENUM ('strong_yes', 'yes', 'unclear', 'no', 'strong_no');

-- CreateEnum
CREATE TYPE "public"."ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HOLD', 'WAITLISTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "public"."EventAccessMode" AS ENUM ('OPEN', 'TICKETED', 'APPLY_OR_PAY');

-- CreateEnum
CREATE TYPE "public"."EventApplyMode" AS ENUM ('APPROVAL_HOLDS_TICKET', 'SUBMIT_CONFIRMS_ENTRY');

-- CreateEnum
CREATE TYPE "public"."EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."FieldType" AS ENUM ('TEXT', 'TEXTAREA', 'SELECT', 'MULTISELECT', 'CHECKBOX', 'DATE', 'EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "public"."MemberStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WAITLISTED', 'GUEST');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."QuestionFlowStep" AS ENUM ('BEFORE_SUBMIT', 'AFTER_PAYMENT', 'BEFORE_APPROVAL');

-- CreateEnum
CREATE TYPE "public"."RSVPStatus" AS ENUM ('CONFIRMED', 'DECLINED', 'WAITLISTED');

-- CreateEnum
CREATE TYPE "public"."TicketStatus" AS ENUM ('AUTHORIZED', 'CAPTURED', 'REFUNDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."Application" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "referredBy" TEXT,
    "status" "public"."ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "aiTags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "city" TEXT,
    "consentEmail" BOOLEAN NOT NULL DEFAULT false,
    "consentSms" BOOLEAN NOT NULL DEFAULT false,
    "fullName" TEXT NOT NULL,
    "rejectionReason" TEXT,
    "aiReasoning" TEXT,
    "aiRecommendation" "public"."AiApplicationRecommendation",
    "aiScore" DOUBLE PRECISION,
    "duplicateFlag" BOOLEAN NOT NULL DEFAULT false,
    "archetype" TEXT,
    "archetypeScores" JSONB,
    "personalizedCopy" TEXT,
    "reviewNote" TEXT,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApplicationAnswer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "location" TEXT,
    "capacity" INTEGER,
    "accessMode" "public"."EventAccessMode" NOT NULL DEFAULT 'OPEN',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "plusOnesAllowed" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."EventStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nonMemberPriceInCents" INTEGER,
    "priceInCents" INTEGER,
    "refundWindowHours" INTEGER,
    "showCapacity" BOOLEAN NOT NULL DEFAULT false,
    "applyMode" "public"."EventApplyMode",
    "heroImageAssetId" TEXT,
    "mapsUrl" TEXT,
    "runOfShow" TEXT,
    "template" TEXT NOT NULL DEFAULT 'editorial',
    "eventAccess" JSONB NOT NULL DEFAULT '{"comp": {"enabled": false, "budgetCap": null}, "guest": {"gate": "pay", "enabled": false, "priceCents": 0}, "member": {"gate": "auto_confirm", "enabled": true, "priceCents": 0}}',

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventCustomQuestion" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "public"."FieldType" NOT NULL,
    "options" TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "showToGuest" BOOLEAN NOT NULL DEFAULT true,
    "showToMember" BOOLEAN NOT NULL DEFAULT true,
    "whenInFlow" "public"."QuestionFlowStep" NOT NULL DEFAULT 'BEFORE_SUBMIT',

    CONSTRAINT "EventCustomQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EventFlowTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessMode" TEXT NOT NULL,
    "applyMode" TEXT,
    "priceInCents" INTEGER,
    "nonMemberPriceInCents" INTEGER,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "plusOnesAllowed" BOOLEAN NOT NULL DEFAULT false,
    "showCapacity" BOOLEAN NOT NULL DEFAULT false,
    "customQuestions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventFlowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Member" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clerkUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "status" "public"."MemberStatus" NOT NULL DEFAULT 'PENDING',
    "tags" TEXT[],
    "energyScore" INTEGER,
    "networkValueScore" INTEGER,
    "aiSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "redListed" BOOLEAN NOT NULL DEFAULT false,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "lastAttendedDate" TIMESTAMP(3),
    "memberQrCode" TEXT,
    "passIssuedAt" TIMESTAMP(3),
    "totalEventsAttended" INTEGER NOT NULL DEFAULT 0,
    "walletPassId" TEXT,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "public"."PaymentStatus" NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RSVP" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "public"."RSVPStatus" NOT NULL DEFAULT 'CONFIRMED',
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "checkedIn" BOOLEAN NOT NULL DEFAULT false,
    "customAnswers" JSONB,
    "origin" TEXT NOT NULL DEFAULT 'direct',
    "plusOneOfMemberId" TEXT,
    "refundAmountCents" INTEGER,
    "refundedAt" TIMESTAMP(3),
    "stripePaymentIntentId" TEXT,
    "ticketStatus" TEXT NOT NULL DEFAULT 'confirmed',
    "compType" TEXT,
    "guestEmail" TEXT,
    "guestName" TEXT,
    "isComp" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RSVP_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RedList" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT,
    "namePattern" TEXT,
    "reason" TEXT,
    "addedByPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Ticket" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "rsvpId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "public"."TicketStatus" NOT NULL,
    "walletPassId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WaitlistEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "memberId" TEXT,
    "position" INTEGER NOT NULL,
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Workspace" (
    "id" TEXT NOT NULL,
    "clerkOrgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "svixAppId" TEXT,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Application_workspaceId_idx" ON "public"."Application"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "ApplicationAnswer_applicationId_idx" ON "public"."ApplicationAnswer"("applicationId" ASC);

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "public"."AuditEvent"("entityType" ASC, "entityId" ASC);

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_idx" ON "public"."AuditEvent"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "Event_workspaceId_idx" ON "public"."Event"("workspaceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Event_workspaceId_slug_key" ON "public"."Event"("workspaceId" ASC, "slug" ASC);

-- CreateIndex
CREATE INDEX "EventCustomQuestion_eventId_idx" ON "public"."EventCustomQuestion"("eventId" ASC);

-- CreateIndex
CREATE INDEX "EventCustomQuestion_workspaceId_idx" ON "public"."EventCustomQuestion"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "EventFlowTemplate_workspaceId_idx" ON "public"."EventFlowTemplate"("workspaceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Member_memberQrCode_key" ON "public"."Member"("memberQrCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Member_workspaceId_clerkUserId_key" ON "public"."Member"("workspaceId" ASC, "clerkUserId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Member_workspaceId_email_key" ON "public"."Member"("workspaceId" ASC, "email" ASC);

-- CreateIndex
CREATE INDEX "Member_workspaceId_idx" ON "public"."Member"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "Payment_ticketId_idx" ON "public"."Payment"("ticketId" ASC);

-- CreateIndex
CREATE INDEX "Payment_workspaceId_idx" ON "public"."Payment"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "RSVP_eventId_idx" ON "public"."RSVP"("eventId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RSVP_workspaceId_eventId_memberId_key" ON "public"."RSVP"("workspaceId" ASC, "eventId" ASC, "memberId" ASC);

-- CreateIndex
CREATE INDEX "RSVP_workspaceId_idx" ON "public"."RSVP"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "RedList_email_idx" ON "public"."RedList"("email" ASC);

-- CreateIndex
CREATE INDEX "RedList_workspaceId_idx" ON "public"."RedList"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "Ticket_eventId_idx" ON "public"."Ticket"("eventId" ASC);

-- CreateIndex
CREATE INDEX "Ticket_workspaceId_idx" ON "public"."Ticket"("workspaceId" ASC);

-- CreateIndex
CREATE INDEX "WaitlistEntry_eventId_idx" ON "public"."WaitlistEntry"("eventId" ASC);

-- CreateIndex
CREATE INDEX "WaitlistEntry_workspaceId_idx" ON "public"."WaitlistEntry"("workspaceId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_clerkOrgId_key" ON "public"."Workspace"("clerkOrgId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "public"."Workspace"("slug" ASC);

-- AddForeignKey
ALTER TABLE "public"."Application" ADD CONSTRAINT "Application_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "public"."Application"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventCustomQuestion" ADD CONSTRAINT "EventCustomQuestion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EventFlowTemplate" ADD CONSTRAINT "EventFlowTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Member" ADD CONSTRAINT "Member_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RSVP" ADD CONSTRAINT "RSVP_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RSVP" ADD CONSTRAINT "RSVP_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RSVP" ADD CONSTRAINT "RSVP_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RedList" ADD CONSTRAINT "RedList_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_rsvpId_fkey" FOREIGN KEY ("rsvpId") REFERENCES "public"."RSVP"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ticket" ADD CONSTRAINT "Ticket_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "public"."Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

