-- CreateTable
CREATE TABLE "IntelligenceInsight" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metricId" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "delta" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "IntelligenceInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedReport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "metricIds" TEXT[],
    "filters" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRunAt" TIMESTAMP(3),

    CONSTRAINT "SavedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntelligenceInsight_workspaceId_idx" ON "IntelligenceInsight"("workspaceId");

-- CreateIndex
CREATE INDEX "IntelligenceInsight_metricId_idx" ON "IntelligenceInsight"("metricId");

-- CreateIndex
CREATE INDEX "SavedReport_workspaceId_idx" ON "SavedReport"("workspaceId");

-- AddForeignKey
ALTER TABLE "IntelligenceInsight" ADD CONSTRAINT "IntelligenceInsight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedReport" ADD CONSTRAINT "SavedReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
