-- Internal comms layer: operator comments + notifications.
-- Apply manually via `npx prisma migrate deploy` after reviewing the diff.

CREATE TABLE "OperatorComment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "OperatorComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperatorComment_workspaceId_entityType_entityId_idx"
    ON "OperatorComment"("workspaceId", "entityType", "entityId");

CREATE INDEX "OperatorComment_workspaceId_createdAt_idx"
    ON "OperatorComment"("workspaceId", "createdAt");

ALTER TABLE "OperatorComment"
    ADD CONSTRAINT "OperatorComment_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OperatorNotification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperatorNotification_recipientId_readAt_idx"
    ON "OperatorNotification"("recipientId", "readAt");

CREATE INDEX "OperatorNotification_workspaceId_createdAt_idx"
    ON "OperatorNotification"("workspaceId", "createdAt");

ALTER TABLE "OperatorNotification"
    ADD CONSTRAINT "OperatorNotification_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
