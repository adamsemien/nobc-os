-- SMS opt-in page (TCPA consent capture) — migration 2 of 2.
--
-- Run AFTER sms-optin-01-enum.sql has been applied and committed (the enum
-- value must exist before anything references it). Apply via:
--   prisma db execute --file prisma/sql/sms-optin-02-artifact.sql
-- NEVER prisma db push (see CLAUDE.md landmine list).
--
-- Generated 2026-07-15 via `prisma migrate diff` (offline, datamodel-to-datamodel).
-- Purely additive: one new enum type, one nullable column on Person, one new
-- table + indexes + FKs. Nothing dropped, altered, or renamed.

-- CreateEnum
CREATE TYPE "ConsentBindingMethod" AS ENUM ('TOKEN_PHONE_MATCH', 'TOKEN_PHONE_NEW', 'COLD');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "postalCode" TEXT;

-- CreateTable
CREATE TABLE "ConsentArtifact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "phone" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "disclosureText" TEXT NOT NULL,
    "disclosureVersion" TEXT NOT NULL,
    "formUrl" TEXT NOT NULL,
    "bindingMethod" "ConsentBindingMethod" NOT NULL,
    "phoneMatchedPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentArtifact_workspaceId_personId_idx" ON "ConsentArtifact"("workspaceId", "personId");

-- CreateIndex
CREATE INDEX "ConsentArtifact_workspaceId_phone_idx" ON "ConsentArtifact"("workspaceId", "phone");

-- AddForeignKey
ALTER TABLE "ConsentArtifact" ADD CONSTRAINT "ConsentArtifact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentArtifact" ADD CONSTRAINT "ConsentArtifact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
