-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('OPERATOR', 'AGENT', 'MEMBER', 'SYSTEM');

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "actorType" "AuditActorType" NOT NULL DEFAULT 'OPERATOR';

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "defaultTemplateId" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "primaryColor" TEXT,
ADD COLUMN     "tierCharterName" TEXT NOT NULL DEFAULT 'Charter',
ADD COLUMN     "tierStandardName" TEXT NOT NULL DEFAULT 'Standard',
ADD COLUMN     "tierWaitlistName" TEXT NOT NULL DEFAULT 'Waitlist';

-- CreateTable
CREATE TABLE "QuestionDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "insightLabel" TEXT NOT NULL,
    "insightDescription" TEXT NOT NULL,
    "scoringDimension" TEXT,
    "scoringWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "scoringLogic" TEXT NOT NULL,
    "archetypeSignals" TEXT[],
    "sponsorRelevance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "scoringInstructions" TEXT NOT NULL,
    "archetypesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "memberWorthEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionDefinition_workspaceId_idx" ON "QuestionDefinition"("workspaceId");

-- CreateIndex
CREATE INDEX "QuestionDefinition_templateId_idx" ON "QuestionDefinition"("templateId");

-- CreateIndex
CREATE INDEX "QuestionDefinition_stableKey_idx" ON "QuestionDefinition"("stableKey");

-- CreateIndex
CREATE INDEX "ApplicationTemplate_workspaceId_idx" ON "ApplicationTemplate"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationTemplate_workspaceId_slug_key" ON "ApplicationTemplate"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "Application_templateId_idx" ON "Application"("templateId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ApplicationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDefinition" ADD CONSTRAINT "QuestionDefinition_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionDefinition" ADD CONSTRAINT "QuestionDefinition_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ApplicationTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationTemplate" ADD CONSTRAINT "ApplicationTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
