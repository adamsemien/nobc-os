-- Attendee messaging layer (Stage 18) - additive only, reviewed 2026-07-03.
-- Generated: prisma migrate diff HEAD-schema -> new schema (3 enums, 3 tables,
-- 6 indexes, 4 FKs; zero DROP / RENAME / ALTER TYPE). Applied to ep-sweet-term
-- via prisma db execute; production application is Adam's act.
-- CreateEnum
CREATE TYPE "BlastChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "BlastStatus" AS ENUM ('DRAFT', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "BlastRecipientStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED_NO_CONSENT', 'SKIPPED_SUPPRESSED', 'SKIPPED_NO_DESTINATION');

-- CreateTable
CREATE TABLE "Blast" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "channel" "BlastChannel" NOT NULL,
    "status" "BlastStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "clientToken" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Blast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlastRecipient" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "blastId" TEXT NOT NULL,
    "rsvpId" TEXT NOT NULL,
    "memberId" TEXT,
    "destination" TEXT NOT NULL,
    "status" "BlastRecipientStatus" NOT NULL,
    "consentSource" TEXT,
    "error" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressedContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channel" "BlastChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressedContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Blast_workspaceId_eventId_createdAt_idx" ON "Blast"("workspaceId", "eventId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Blast_workspaceId_clientToken_key" ON "Blast"("workspaceId", "clientToken");

-- CreateIndex
CREATE INDEX "BlastRecipient_workspaceId_blastId_idx" ON "BlastRecipient"("workspaceId", "blastId");

-- CreateIndex
CREATE INDEX "BlastRecipient_blastId_status_idx" ON "BlastRecipient"("blastId", "status");

-- CreateIndex
CREATE INDEX "SuppressedContact_workspaceId_idx" ON "SuppressedContact"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressedContact_workspaceId_channel_destination_key" ON "SuppressedContact"("workspaceId", "channel", "destination");

-- AddForeignKey
ALTER TABLE "Blast" ADD CONSTRAINT "Blast_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blast" ADD CONSTRAINT "Blast_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlastRecipient" ADD CONSTRAINT "BlastRecipient_blastId_fkey" FOREIGN KEY ("blastId") REFERENCES "Blast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressedContact" ADD CONSTRAINT "SuppressedContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

