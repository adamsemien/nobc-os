-- Slice 4 (Segments, saved views & the operator-action log) — additive only.
-- Generated via `prisma migrate diff` (schema-to-schema: main's prisma/schema.prisma
-- vs this branch's, never against a live datasource — see the build report for how
-- that isolation works). Zero DROP, zero ALTER TYPE/RENAME on any existing object.
--
-- New enum (SegmentKind) + 4 new tables (OperatorAction, OperatorActionTarget,
-- Segment, SegmentSnapshotMember). No existing table's columns are touched.
--
-- Run on the unpooled endpoint (DIRECT_URL), never `db push`, never `npx prisma`:
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/segments-slice4.sql --schema prisma/schema.prisma
--
-- Unlike Slices 0/3, there is no separate standalone enum-values file here:
-- SegmentKind is a brand-new enum type (CREATE TYPE), not new values added to an
-- existing enum (ALTER TYPE ... ADD VALUE) — so none of the "must run standalone,
-- can't be in the same transaction, unpooled endpoint only" caveats that apply to
-- ADD VALUE apply here. This one file is safe to run as a single statement batch.

-- CreateEnum
CREATE TYPE "SegmentKind" AS ENUM ('DYNAMIC', 'STATIC');

-- CreateTable
CREATE TABLE "OperatorAction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "summary" TEXT,
    "metadata" JSONB,
    "targetCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatorActionTarget" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "personId" TEXT,
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperatorActionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "definition" JSONB NOT NULL,
    "kind" "SegmentKind" NOT NULL DEFAULT 'DYNAMIC',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastEvaluatedAt" TIMESTAMP(3),
    "cachedCount" INTEGER,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentSnapshotMember" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "personId" TEXT,
    "memberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentSnapshotMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperatorAction_workspaceId_idx" ON "OperatorAction"("workspaceId");

-- CreateIndex
CREATE INDEX "OperatorAction_workspaceId_actorId_idx" ON "OperatorAction"("workspaceId", "actorId");

-- CreateIndex
CREATE INDEX "OperatorAction_workspaceId_actionType_idx" ON "OperatorAction"("workspaceId", "actionType");

-- CreateIndex
CREATE INDEX "OperatorAction_createdAt_idx" ON "OperatorAction"("createdAt");

-- CreateIndex
CREATE INDEX "OperatorActionTarget_actionId_idx" ON "OperatorActionTarget"("actionId");

-- CreateIndex
CREATE INDEX "OperatorActionTarget_personId_idx" ON "OperatorActionTarget"("personId");

-- CreateIndex
CREATE INDEX "OperatorActionTarget_memberId_idx" ON "OperatorActionTarget"("memberId");

-- CreateIndex
CREATE INDEX "Segment_workspaceId_idx" ON "Segment"("workspaceId");

-- CreateIndex
CREATE INDEX "SegmentSnapshotMember_segmentId_idx" ON "SegmentSnapshotMember"("segmentId");

-- CreateIndex
CREATE INDEX "SegmentSnapshotMember_personId_idx" ON "SegmentSnapshotMember"("personId");

-- CreateIndex
CREATE INDEX "SegmentSnapshotMember_memberId_idx" ON "SegmentSnapshotMember"("memberId");

-- Out-of-band partial unique indexes (NOT Prisma-generated — @@unique can't
-- express a WHERE clause, same class as ChannelSubscription_person_channel_
-- stream_key from Slice 0). Prevents a STATIC segment's frozen snapshot from
-- carrying a duplicate row for the same person or the same member. This is
-- the ONLY place SegmentSnapshotMember's uniqueness is enforced — there is no
-- @@unique for it in schema.prisma. See CLAUDE.md's "Schema changes: never
-- prisma db push" section — a db push would see these as drift and drop them.
CREATE UNIQUE INDEX "SegmentSnapshotMember_segment_person_key"
  ON "SegmentSnapshotMember"("segmentId", "personId")
  WHERE "personId" IS NOT NULL;

CREATE UNIQUE INDEX "SegmentSnapshotMember_segment_member_key"
  ON "SegmentSnapshotMember"("segmentId", "memberId")
  WHERE "memberId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "OperatorAction" ADD CONSTRAINT "OperatorAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorActionTarget" ADD CONSTRAINT "OperatorActionTarget_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "OperatorAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorActionTarget" ADD CONSTRAINT "OperatorActionTarget_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperatorActionTarget" ADD CONSTRAINT "OperatorActionTarget_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentSnapshotMember" ADD CONSTRAINT "SegmentSnapshotMember_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentSnapshotMember" ADD CONSTRAINT "SegmentSnapshotMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentSnapshotMember" ADD CONSTRAINT "SegmentSnapshotMember_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
