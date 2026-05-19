-- CreateEnum
CREATE TYPE "WatchListType" AS ENUM ('PURPLE', 'BLOCKED');

-- AlterTable
ALTER TABLE "RSVP" ADD COLUMN     "amountCents" INTEGER,
ADD COLUMN     "capturedAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" TEXT;

-- CreateTable
CREATE TABLE "WatchList" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "WatchListType" NOT NULL,
    "matchEmail" TEXT,
    "matchPhone" TEXT,
    "matchInstagram" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WatchList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WatchList_workspaceId_idx" ON "WatchList"("workspaceId");

-- CreateIndex
CREATE INDEX "WatchList_workspaceId_type_idx" ON "WatchList"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "WatchList_matchEmail_idx" ON "WatchList"("matchEmail");

-- CreateIndex
CREATE INDEX "WatchList_matchPhone_idx" ON "WatchList"("matchPhone");

-- CreateIndex
CREATE INDEX "WatchList_matchInstagram_idx" ON "WatchList"("matchInstagram");

-- AddForeignKey
ALTER TABLE "WatchList" ADD CONSTRAINT "WatchList_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
