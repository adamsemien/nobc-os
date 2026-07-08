-- Apply Scoring v2 — Reveal B: persist the deterministic tally output on Application.
-- ADDITIVE ONLY. Six nullable columns, no defaults, no drops, no type changes, no
-- renames. Safe to run on the live Neon DB while Producer shares the instance.
--
-- Why persist (not recompute at the reveal): the reveal must read the DECISIVE blend
-- (normalized from raw combined tally points, e.g. 78/22), never recompute it from the
-- normalized 0-100 archetypeScores vector (which is fit-centered and flattens the top
-- two toward ~55/45). scoreApplication() writes these at scoring time; the reveal reads
-- them verbatim.
--
-- The PRIMARY nature is the existing Application."archetype" column (unchanged).
-- The reveal note is the existing Application."personalNote" column (unchanged).
--
-- Run this ONCE in the Neon SQL console (Adam). Agents never execute it. Idempotent:
-- ADD COLUMN IF NOT EXISTS is a no-op if the column already exists.
-- Never `prisma db push` (it would drop the DAM GIN index — see CLAUDE.md).

BEGIN;

ALTER TABLE "Application"
  ADD COLUMN IF NOT EXISTS "revealSecondary"      TEXT,     -- secondary nature (STORED enum; UI maps to displayName)
  ADD COLUMN IF NOT EXISTS "revealBlendPrimary"   INTEGER,  -- decisive blend %, primary  (0-100)
  ADD COLUMN IF NOT EXISTS "revealBlendSecondary" INTEGER,  -- decisive blend %, secondary (0-100)
  ADD COLUMN IF NOT EXISTS "revealOpenerPhrase"   TEXT,     -- Q6 (bestSelf) openerPhrase — opens the reveal, never contradicted
  ADD COLUMN IF NOT EXISTS "revealHabitatThrive"  TEXT,     -- Q4 (perfectFriday) picked option label — "your best rooms"
  ADD COLUMN IF NOT EXISTS "revealHabitatDim"     TEXT;     -- Q5 (skipFriday) picked option label — "rooms that don't deserve you"

COMMIT;
