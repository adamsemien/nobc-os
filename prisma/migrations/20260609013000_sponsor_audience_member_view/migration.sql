-- RECONCILIATION CATCH-UP MIGRATION
-- Records the out-of-band SQL in prisma/sql/sponsor-audience-view.sql that was hand-applied
-- to the shared Neon instance but never tracked. Body is the EXACT idempotent SQL already
-- in prod; apply via `prisma migrate resolve --applied 20260609013000_sponsor_audience_member_view`
-- (writes a _prisma_migrations row only — ZERO DDL). See _context/MIGRATION-RECONCILIATION-RUNBOOK.md.
--
-- Ordered LAST: this view reads the firmographic columns added by
-- 20260609012000_member_pr2_dimensions (customFields, fieldProvenance, city, country,
-- companyName, companyDomain, linkedinUrl) and the mergedIntoId column added by
-- 20260609011000_member_merge.
--
-- The sponsor firewall, enforced in the database. `sponsor_audience_member` is the ONLY
-- member shape sponsor-facing aggregation may read. It projects firmographic + coarse-
-- demographic + provenance columns and PHYSICALLY CANNOT reach psychographic data (it never
-- joins "MemberPsychographics" and omits archetype/scores/raw income band). Prisma does not
-- model SQL views, so this object is invisible to `migrate diff` (no false drift from it).
-- Two invariants are baked into the WHERE clause so a caller cannot forget them:
--   * status = 'APPROVED'  — GUEST walk-ins must never inflate sponsor firmographics.
--   * mergedIntoId IS NULL — soft-merged duplicates must never be counted twice.
-- Additive (CREATE OR REPLACE VIEW); safe to re-run; safe for Producer (new object).

CREATE OR REPLACE VIEW "sponsor_audience_member" AS
SELECT
  m."id",
  m."workspaceId",
  -- Firmographic
  m."industry",
  m."jobFunction",
  m."seniority",
  m."companySize",
  m."companyName",
  m."companyDomain",
  m."linkedinUrl",
  -- Coarse demographic (geo + age band; no exact household income)
  m."city",
  m."country",
  m."ageRange",
  -- Operator-defined custom fields + their provenance. Per-field sponsorVisible
  -- gating and the self_reported/verified_enrichment-only aggregation rule are
  -- applied by the reader; the view's job is to make psychographic data unreachable.
  m."customFields",
  m."fieldProvenance"
FROM "Member" m
WHERE m."status" = 'APPROVED'
  AND m."mergedIntoId" IS NULL;
