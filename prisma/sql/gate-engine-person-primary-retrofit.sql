-- ═══════════════════════════════════════════════════════════════════════════
-- Gate Engine Person-Primary Retrofit (Stage 17) — 2026-07-10.
--
-- Adds nullable Person dual-pointers to the three Member-only-keyed gate
-- tables: GateProof (personId), GateSession (personId), GrowthEdge
-- (fromPersonId + toPersonId). Widens GateProof.memberId and
-- GrowthEdge.fromMemberId/toMemberId to nullable so a bare Person (no Member
-- row) can be a proof subject / edge endpoint. Member FK delete semantics are
-- UNCHANGED (onDelete: Restrict pinned in schema.prisma so this file contains
-- zero DROP CONSTRAINT statements); new Person FKs use ON DELETE SET NULL,
-- matching the RSVP.person house pattern.
--
-- Sections 1–2 generated 2026-07-10 via (offline, datamodel-to-datamodel —
-- deliberately NOT the --from-config-datasource form, which would connect to
-- Neon):
--   node node_modules/prisma/build/index.js migrate diff \
--     --from-schema <pre-retrofit prisma/schema.prisma> \
--     --to-schema   prisma/schema.prisma --script
-- then reorganized: ADD COLUMNs split from the DROP NOT NULLs so Section 2
-- isolates the three nullability widenings for review. Section 3 is
-- hand-written (Prisma @@unique cannot express partial WHERE clauses).
--
-- Reviewed: zero DROP TABLE / DROP CONSTRAINT / DROP INDEX / ALTER TYPE /
-- RENAME. The ONLY ALTERs beyond ADD COLUMN are the three
-- ALTER COLUMN ... DROP NOT NULL in Section 2 — nullability widening,
-- non-destructive and reversible, approved by Adam 2026-07-10 as the
-- justified exception to the refuse-ALTERs rule.
--
-- Run MANUALLY in the Neon SQL console. NEVER `prisma db push` on this repo
-- (it drops the out-of-band indexes: Asset_searchVector_idx, the
-- ChannelSubscription partial, the two SegmentSnapshotMember partials — and,
-- once this file is applied, the four Section-3 partials below).
--
-- Run sections in order (1 → 2 → 3). No enum changes, so unlike
-- ways-in-phase-a.sql the whole file MAY run in a single transaction.
-- Production (ep-twilight-forest): Adam runs it himself.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — pure additive: columns, lookup indexes, Person FKs
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable (add only)
ALTER TABLE "GateProof" ADD COLUMN "personId" TEXT;

-- AlterTable (add only)
ALTER TABLE "GrowthEdge" ADD COLUMN "fromPersonId" TEXT,
ADD COLUMN "toPersonId" TEXT;

-- AlterTable (add only)
ALTER TABLE "GateSession" ADD COLUMN "personId" TEXT;

-- CreateIndex
CREATE INDEX "GateProof_workspaceId_personId_conditionType_idx" ON "GateProof"("workspaceId", "personId", "conditionType");

-- CreateIndex
CREATE INDEX "GateProof_personId_idx" ON "GateProof"("personId");

-- CreateIndex
CREATE INDEX "GrowthEdge_workspaceId_toPersonId_idx" ON "GrowthEdge"("workspaceId", "toPersonId");

-- CreateIndex
CREATE INDEX "GrowthEdge_workspaceId_fromPersonId_idx" ON "GrowthEdge"("workspaceId", "fromPersonId");

-- CreateIndex
CREATE INDEX "GateSession_gateId_personId_idx" ON "GateSession"("gateId", "personId");

-- AddForeignKey
ALTER TABLE "GateProof" ADD CONSTRAINT "GateProof_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthEdge" ADD CONSTRAINT "GrowthEdge_fromPersonId_fkey" FOREIGN KEY ("fromPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthEdge" ADD CONSTRAINT "GrowthEdge_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateSession" ADD CONSTRAINT "GateSession_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — ⚠ THE THREE NULLABILITY WIDENINGS (the flagged ALTERs)
--
-- These relax NOT NULL so a bare Person can key a proof / edge endpoint.
-- Non-destructive (no data changes, trivially reversible while no NULL rows
-- exist). Existing member FKs keep ON DELETE RESTRICT — untouched by this
-- file. Approved by Adam 2026-07-10.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "GateProof" ALTER COLUMN "memberId" DROP NOT NULL;

ALTER TABLE "GrowthEdge" ALTER COLUMN "fromMemberId" DROP NOT NULL;

ALTER TABLE "GrowthEdge" ALTER COLUMN "toMemberId" DROP NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — out-of-band partial unique indexes (hand-written)
--
-- Prisma's @@unique cannot express a WHERE clause, so these live ONLY in the
-- database — same class as ChannelSubscription_person_channel_stream_key and
-- the two SegmentSnapshotMember partials. Once applied they are entries
-- #5–#8 on the CLAUDE.md db-push landmine list: any `prisma db push` would
-- see them as drift and DROP them.
--
-- Member-side uniqueness needs NO new index anywhere: GateProof's
-- @@unique([nodeId, memberId]) and GrowthEdge's
-- @@unique([workspaceId, type, fromMemberId, toMemberId]) already behave as
-- member-side partials under Postgres NULLs-distinct semantics.
-- GateSession gets NO uniques at all — sessions are deliberately
-- many-per-visitor (every mint creates one).
--
-- GrowthEdge combination notes: live code writes member->member only (the
-- REFERRED_BY_MEMBER verifier requires an approved-Member referrer).
-- member->person is the first real new combination; the two person-from
-- indexes are future-proofing for person-initiated edge types.
-- ─────────────────────────────────────────────────────────────────────────────

-- One live proof per (node, person) — person-side mirror of the in-schema
-- @@unique([nodeId, memberId]).
CREATE UNIQUE INDEX "GateProof_node_person_key"
  ON "GateProof"("nodeId", "personId")
  WHERE "personId" IS NOT NULL;

-- One edge per (workspace, type, endpoints) for each person-bearing shape.
CREATE UNIQUE INDEX "GrowthEdge_ws_type_fromPerson_toPerson_key"
  ON "GrowthEdge"("workspaceId", "type", "fromPersonId", "toPersonId")
  WHERE "fromPersonId" IS NOT NULL AND "toPersonId" IS NOT NULL;

CREATE UNIQUE INDEX "GrowthEdge_ws_type_fromMember_toPerson_key"
  ON "GrowthEdge"("workspaceId", "type", "fromMemberId", "toPersonId")
  WHERE "fromMemberId" IS NOT NULL AND "toPersonId" IS NOT NULL;

CREATE UNIQUE INDEX "GrowthEdge_ws_type_fromPerson_toMember_key"
  ON "GrowthEdge"("workspaceId", "type", "fromPersonId", "toMemberId")
  WHERE "fromPersonId" IS NOT NULL AND "toMemberId" IS NOT NULL;
