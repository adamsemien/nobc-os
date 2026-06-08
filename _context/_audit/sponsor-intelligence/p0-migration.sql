-- DropIndex
DROP INDEX "Asset_searchVector_idx";

-- AlterTable
ALTER TABLE "SponsorBrandProfile" ADD COLUMN     "declaredObjectives" TEXT,
ADD COLUMN     "rightsFeeCents" INTEGER,
ADD COLUMN     "targetPersonaCriteria" JSONB;

-- CreateTable
CREATE TABLE "RecapSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sponsorBrandId" TEXT,
    "metrics" JSONB NOT NULL,
    "mediaValueInputs" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBySession" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecapSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecapSnapshot_workspaceId_idx" ON "RecapSnapshot"("workspaceId");

-- CreateIndex
CREATE INDEX "RecapSnapshot_eventId_idx" ON "RecapSnapshot"("eventId");

-- CreateIndex
CREATE INDEX "RecapSnapshot_sponsorBrandId_idx" ON "RecapSnapshot"("sponsorBrandId");

-- AddForeignKey
ALTER TABLE "RecapSnapshot" ADD CONSTRAINT "RecapSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecapSnapshot" ADD CONSTRAINT "RecapSnapshot_sponsorBrandId_fkey" FOREIGN KEY ("sponsorBrandId") REFERENCES "SponsorBrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
