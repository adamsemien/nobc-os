-- AlterTable: add producerEventId to Event for Phase J inbound sync
ALTER TABLE "Event" ADD COLUMN "producerEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Event_producerEventId_key" ON "Event"("producerEventId");
