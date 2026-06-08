-- DropIndex
DROP INDEX "Asset_searchVector_idx";

-- AlterTable
ALTER TABLE "EventCustomQuestion" ADD COLUMN     "sponsorBrandId" TEXT;

-- CreateIndex
CREATE INDEX "EventCustomQuestion_sponsorBrandId_idx" ON "EventCustomQuestion"("sponsorBrandId");

-- AddForeignKey
ALTER TABLE "EventCustomQuestion" ADD CONSTRAINT "EventCustomQuestion_sponsorBrandId_fkey" FOREIGN KEY ("sponsorBrandId") REFERENCES "SponsorBrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
