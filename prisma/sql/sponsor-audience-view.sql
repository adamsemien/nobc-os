-- sponsor-audience-view.sql  (member-intelligence PR2, S8)
--
-- The sponsor firewall, enforced in the database. `sponsor_audience_member` is the
-- ONLY member shape sponsor-facing aggregation may read. It projects firmographic +
-- coarse-demographic + provenance columns from "Member" and PHYSICALLY CANNOT reach
-- psychographic data: it never joins "MemberPsychographics", and it omits archetype,
-- aiSummary, every score column, and the raw "householdIncome" band.
--
-- It mirrors the SponsorAudienceMember TypeScript type in lib/intelligence/sponsor-safe.ts.
-- Out-of-band, same class as Asset_searchVector_idx (prisma/sql/dam-search-vector.sql):
-- NOT represented in schema.prisma, applied by hand, never via `prisma db push`.
--
-- Two invariants are baked into the WHERE clause so they cannot be forgotten by a caller:
--   * status = 'APPROVED'  — GUEST walk-ins must never inflate sponsor firmographics.
--   * mergedIntoId IS NULL — soft-merged duplicates must never be counted twice.
--
-- Run on the UNPOOLED endpoint:
--   DATABASE_URL="$DIRECT_URL" node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/sponsor-audience-view.sql
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
