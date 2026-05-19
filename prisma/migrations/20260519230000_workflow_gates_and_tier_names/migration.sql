-- AlterTable: editable tier labels
ALTER TABLE "Workspace" ADD COLUMN "tierNames" JSONB;

-- CreateTable: EventWorkflow
CREATE TABLE "EventWorkflow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "templateKey" TEXT,
    "paths" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventWorkflow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventWorkflow_eventId_key" ON "EventWorkflow"("eventId");
CREATE INDEX "EventWorkflow_workspaceId_eventId_idx" ON "EventWorkflow"("workspaceId", "eventId");

ALTER TABLE "EventWorkflow" ADD CONSTRAINT "EventWorkflow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventWorkflow" ADD CONSTRAINT "EventWorkflow_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
