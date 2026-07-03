-- Access Gate Engine v3 - Milestone 1 (Stage 17). ADDITIVE ONLY.
--
-- Creates the five engine tables (Gate, GateNode, GateProof, GrowthEdge,
-- GateSession) and their enums. Generated 2026-07-01 via:
--   node node_modules/prisma/build/index.js migrate diff \
--     --from-schema <main prisma/schema.prisma> \
--     --to-schema   <feat/gate-engine-m1 prisma/schema.prisma> --script
-- Reviewed: zero DROP / ALTER TYPE / RENAME statements. Datamodel-to-datamodel
-- diff, so the known false-drift DROPs of the out-of-band DAM indexes
-- (Asset_searchVector_idx, Asset_embedding_hnsw_idx) cannot appear here.
--
-- Apply with `prisma db execute --file prisma/sql/gate-engine-m1.sql` against
-- the CONFIRMED dev/scratch branch only (ep-sweet-term). NEVER `prisma db
-- push`. NEVER against production (ep-twilight-forest) without Adam running it
-- himself in the Neon console.

-- CreateEnum
CREATE TYPE "GateNodeKind" AS ENUM ('CONDITION', 'GROUP');

-- CreateEnum
CREATE TYPE "GateGroupRule" AS ENUM ('ALL', 'ANY_N', 'WEIGHTED');

-- CreateEnum
CREATE TYPE "GateResourceType" AS ENUM ('EVENT');

-- CreateEnum
CREATE TYPE "VerificationTier" AS ENUM ('FIRST_PARTY', 'AI_ATTESTED');

-- CreateEnum
CREATE TYPE "ProofMechanism" AS ENUM ('INTERNAL_RECORD', 'STRIPE_PAYMENT', 'AI_SCORING');

-- CreateEnum
CREATE TYPE "GateProofStatus" AS ENUM ('SATISFIED', 'REJECTED', 'PENDING_REVIEW');

-- CreateEnum
CREATE TYPE "GrowthEdgeType" AS ENUM ('REFERRAL');

-- CreateEnum
CREATE TYPE "GateSessionStatus" AS ENUM ('ACTIVE', 'SATISFIED', 'EXPIRED');

-- CreateTable
CREATE TABLE "Gate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "resourceType" "GateResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateNode" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" "GateNodeKind" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "rule" "GateGroupRule",
    "requiredCount" INTEGER,
    "weightThreshold" INTEGER,
    "conditionType" TEXT,
    "config" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateProof" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "nodeId" TEXT,
    "memberId" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    "status" "GateProofStatus" NOT NULL,
    "tier" "VerificationTier" NOT NULL,
    "mechanism" "ProofMechanism" NOT NULL,
    "payload" JSONB,
    "sourceProofId" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthEdge" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "GrowthEdgeType" NOT NULL,
    "fromMemberId" TEXT NOT NULL,
    "toMemberId" TEXT NOT NULL,
    "resourceType" "GateResourceType",
    "resourceId" TEXT,
    "proofId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "memberId" TEXT,
    "token" TEXT NOT NULL,
    "status" "GateSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastDecision" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gate_workspaceId_idx" ON "Gate"("workspaceId");

-- CreateIndex
CREATE INDEX "Gate_resourceType_resourceId_idx" ON "Gate"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Gate_workspaceId_resourceType_resourceId_key" ON "Gate"("workspaceId", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "GateNode_workspaceId_idx" ON "GateNode"("workspaceId");

-- CreateIndex
CREATE INDEX "GateNode_gateId_idx" ON "GateNode"("gateId");

-- CreateIndex
CREATE INDEX "GateNode_parentId_idx" ON "GateNode"("parentId");

-- CreateIndex
CREATE INDEX "GateProof_workspaceId_memberId_conditionType_idx" ON "GateProof"("workspaceId", "memberId", "conditionType");

-- CreateIndex
CREATE INDEX "GateProof_memberId_idx" ON "GateProof"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "GateProof_nodeId_memberId_key" ON "GateProof"("nodeId", "memberId");

-- CreateIndex
CREATE INDEX "GrowthEdge_workspaceId_toMemberId_idx" ON "GrowthEdge"("workspaceId", "toMemberId");

-- CreateIndex
CREATE INDEX "GrowthEdge_workspaceId_fromMemberId_idx" ON "GrowthEdge"("workspaceId", "fromMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthEdge_workspaceId_type_fromMemberId_toMemberId_key" ON "GrowthEdge"("workspaceId", "type", "fromMemberId", "toMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "GateSession_token_key" ON "GateSession"("token");

-- CreateIndex
CREATE INDEX "GateSession_workspaceId_idx" ON "GateSession"("workspaceId");

-- CreateIndex
CREATE INDEX "GateSession_gateId_memberId_idx" ON "GateSession"("gateId", "memberId");

-- AddForeignKey
ALTER TABLE "Gate" ADD CONSTRAINT "Gate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateNode" ADD CONSTRAINT "GateNode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateNode" ADD CONSTRAINT "GateNode_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateNode" ADD CONSTRAINT "GateNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GateNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateProof" ADD CONSTRAINT "GateProof_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateProof" ADD CONSTRAINT "GateProof_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "GateNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateProof" ADD CONSTRAINT "GateProof_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthEdge" ADD CONSTRAINT "GrowthEdge_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthEdge" ADD CONSTRAINT "GrowthEdge_fromMemberId_fkey" FOREIGN KEY ("fromMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthEdge" ADD CONSTRAINT "GrowthEdge_toMemberId_fkey" FOREIGN KEY ("toMemberId") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateSession" ADD CONSTRAINT "GateSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateSession" ADD CONSTRAINT "GateSession_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateSession" ADD CONSTRAINT "GateSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
