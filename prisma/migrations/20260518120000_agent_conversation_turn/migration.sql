-- CreateEnum
CREATE TYPE "AgentTurnRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL_CALL', 'TOOL_RESULT');

-- CreateEnum
CREATE TYPE "AgentTurnStatus" AS ENUM ('PENDING', 'AWAITING_CONFIRMATION', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "AgentConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastTurnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT,

    CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTurn" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AgentTurnRole" NOT NULL,
    "content" TEXT,
    "toolName" TEXT,
    "toolInput" JSONB,
    "toolOutput" JSONB,
    "status" "AgentTurnStatus" NOT NULL DEFAULT 'COMPLETED',
    "confirmationPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentConversation_workspaceId_idx" ON "AgentConversation"("workspaceId");

-- CreateIndex
CREATE INDEX "AgentConversation_operatorId_idx" ON "AgentConversation"("operatorId");

-- CreateIndex
CREATE INDEX "AgentTurn_conversationId_idx" ON "AgentTurn"("conversationId");

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTurn" ADD CONSTRAINT "AgentTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
