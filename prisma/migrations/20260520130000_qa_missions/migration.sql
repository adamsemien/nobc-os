-- Gamified QA testing missions (dev toolbar Game Mode).
-- Apply manually via `npx prisma migrate deploy` after reviewing the diff.

CREATE TABLE "QAMission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "missionType" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "targetSteps" JSONB NOT NULL,
    "completedSteps" JSONB NOT NULL DEFAULT '[]',
    "score" INTEGER NOT NULL DEFAULT 0,
    "bugsFound" JSONB NOT NULL DEFAULT '[]',
    "feedback" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "QAMission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QAMission_workspaceId_operatorId_idx"
    ON "QAMission"("workspaceId", "operatorId");

CREATE INDEX "QAMission_workspaceId_status_idx"
    ON "QAMission"("workspaceId", "status");

CREATE INDEX "QAMission_workspaceId_score_idx"
    ON "QAMission"("workspaceId", "score");

ALTER TABLE "QAMission"
    ADD CONSTRAINT "QAMission_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
