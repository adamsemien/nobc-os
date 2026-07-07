-- NoBC Apply Scoring v2 - Phase 1 seed: the six In-A-Room questions + option point maps.
-- Target workspace: cmpd6xckn000004jl47xpwghx  (template slug 'membership' = the workspace defaultTemplate)
-- ADDITIVE + IDEMPOTENT. Safe to re-run: deletes ONLY the six In-A-Room stableKeys
-- (cascading their QuestionOptions), then re-inserts. The 13 typed scored questions
-- are never touched by this file.
--
-- Requires the QuestionOption table (see companion DDL from 'prisma migrate diff').
-- NEVER run via 'prisma db push' (drops the out-of-band Asset_searchVector_idx GIN index).
-- Run this in the Neon Console SQL editor against PROD. Agents never touch the DB.
--
-- WARNING: re-running apply-scoring-reseed-2026-07.sql DELETEs ALL QuestionDefinitions
-- for this template and will cascade-delete these six + their options. Run that reseed
-- FIRST (or fold these inserts into it); run THIS file after, or on its own to refresh.
BEGIN;

-- 0. Ensure the additive table exists (no-op if the migrate-diff DDL already ran).
CREATE TABLE IF NOT EXISTS "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "archetype" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "openerPhrase" TEXT,
    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "QuestionOption_questionId_idx" ON "QuestionOption"("questionId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'QuestionOption_questionId_fkey') THEN
    ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey"
      FOREIGN KEY ("questionId") REFERENCES "QuestionDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 1. Additive column (already drafted in schema; idempotent here).
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "personalNote" TEXT;

-- 2. Idempotent refresh: remove only the six In-A-Room questions (cascades options).
DELETE FROM "QuestionDefinition"
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')
  AND "stableKey" IN ('roomPosition', 'giftMaking', 'partyJudge', 'perfectFriday', 'skipFriday', 'bestSelf');

-- 3. Insert the six In-A-Room QuestionDefinitions (scoringDimension NULL = excluded from LLM).
INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'roomPosition', 'It''s 8pm at a dinner party in full swing. Where are we most likely to find you? Be honest, not aspirational. There''s no wrong room position.', 'tap_grid', 'in-a-room', 14, false, true,
   'Room position (self-report)', 'Where they instinctively place themselves in a live room. Direct archetype signal.', NULL, 0, 'Single tap. Selected option awards +2 to its mapped archetype. No AI grading; deterministic.',
   ARRAY[]::text[], NULL, now(), now()),
  (gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'giftMaking', 'In a room, your gift is making... Pick the one that''s MOST you, and the one that''s LEAST you. The least matters as much as the most.', 'most_least', 'in-a-room', 15, false, true,
   'Gift in a room (most/least)', 'Primary tiebreaker. Most = strongest self-identified contribution; least = clearest anti-signal.', NULL, 0, 'Most tap awards +2, least tap awards -1 to mapped archetypes. Options store +2 base; most/least applied at tally time. Primary tiebreaker.',
   ARRAY[]::text[], NULL, now(), now()),
  (gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'partyJudge', 'What do you secretly judge a party for? Again: one MOST, one LEAST. We won''t tell.', 'most_least', 'in-a-room', 16, false, true,
   'Party judgment (most/least)', 'Shadow data disguised as a wink. What they judge reveals what they value.', NULL, 0, 'Most tap awards +2, least tap awards -1 to mapped archetypes. Options store +2 base.',
   ARRAY[]::text[], NULL, now(), now()),
  (gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'perfectFriday', 'Pick your perfect Friday night.', 'tap_grid', 'in-a-room', 17, false, true,
   'Perfect Friday (habitat thrive)', 'Doubles as habitat-thrive and event-design data. The room that brings out their best.', NULL, 0, 'Single tap. Selected option awards +2 to its mapped archetype. Also drives habitat-thrive copy.',
   ARRAY[]::text[], NULL, now(), now()),
  (gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'skipFriday', 'Now the one you''d politely skip. Same list. What you''d pass on says as much as what you''d pick.', 'tap_grid', 'in-a-room', 18, false, true,
   'Skipped Friday (habitat dim / anti-signal)', 'Most honest answer in the profile. Drives habitat-dim copy and negative archetype signal.', NULL, 0, 'Single tap. Selected option awards -2 to its mapped archetype. Same six labels as perfectFriday. Anti-signal.',
   ARRAY[]::text[], NULL, now(), now()),
  (gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'bestSelf', 'At your absolute best in a room, people would say you were...', 'tap_grid', 'in-a-room', 19, false, true,
   'Best self (reveal opener)', 'REVEAL KEY. Chosen phrase becomes the opening line of the reveal, in the member''s own self-image. Never contradicted.', NULL, 0, 'Single tap. Selected option awards +2 to its mapped archetype AND stores the openerPhrase used to open the reveal.',
   ARRAY[]::text[], NULL, now(), now());

-- 4. Insert the option point maps (stored-enum archetype; member never sees archetype/points).
INSERT INTO "QuestionOption" (id, "questionId", "order", label, archetype, points, "openerPhrase")
VALUES
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'roomPosition' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 1, 'Deep in one conversation that started an hour ago', 'Sage', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'roomPosition' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 2, 'Making sure two specific people finally meet', 'Connector', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'roomPosition' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 3, 'In the kitchen, helping with the next course', 'Host', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'roomPosition' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 4, 'Mid-story, with half the table listening', 'Spark', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'roomPosition' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 5, 'Talking through someone''s new idea, drawing on a napkin', 'Builder', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'roomPosition' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 6, 'Catching up properly with the person I came to see', 'Patron', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'giftMaking' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 1, '...the night fun', 'Spark', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'giftMaking' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 2, '...the space feel like home', 'Host', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'giftMaking' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 3, '...the conversation deeper', 'Sage', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'giftMaking' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 4, '...the right people meet', 'Connector', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'giftMaking' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 5, '...one person feel like the only person in the room', 'Patron', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'giftMaking' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 6, '...ambitious things feel possible', 'Builder', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'partyJudge' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 1, 'Low energy', 'Spark', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'partyJudge' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 2, 'Bad hospitality', 'Host', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'partyJudge' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 3, 'Shallow conversation', 'Sage', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'partyJudge' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 4, 'A guest list with no range', 'Connector', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'partyJudge' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 5, 'Flaky people', 'Patron', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'partyJudge' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 6, 'No point to the night', 'Builder', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'perfectFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 1, 'A house party with great music that goes late', 'Spark', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'perfectFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 2, 'Hosting a table of six, menu planned days ago', 'Host', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'perfectFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 3, 'A three-hour dinner with one or two brilliant people', 'Sage', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'perfectFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 4, 'A room full of people who''ve never met, and should', 'Connector', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'perfectFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 5, 'The standing dinner where everyone already knows everyone', 'Patron', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'perfectFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 6, 'A salon, a tasting, a dinner with a theme', 'Builder', 2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'skipFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 1, 'A house party with great music that goes late', 'Spark', -2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'skipFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 2, 'Hosting a table of six, menu planned days ago', 'Host', -2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'skipFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 3, 'A three-hour dinner with one or two brilliant people', 'Sage', -2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'skipFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 4, 'A room full of people who''ve never met, and should', 'Connector', -2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'skipFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 5, 'The standing dinner where everyone already knows everyone', 'Patron', -2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'skipFriday' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 6, 'A salon, a tasting, a dinner with a theme', 'Builder', -2, NULL),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'bestSelf' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 1, 'Magnetic', 'Spark', 2, 'Magnetic'),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'bestSelf' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 2, 'The reason it felt like home', 'Host', 2, 'The reason it felt like home'),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'bestSelf' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 3, 'The best conversation there', 'Sage', 2, 'The best conversation there'),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'bestSelf' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 4, 'The night''s best introduction', 'Connector', 2, 'The night''s best introduction'),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'bestSelf' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 5, 'Someone''s whole cheering section', 'Patron', 2, 'Someone''s whole cheering section'),
  (gen_random_uuid()::text, (SELECT id FROM "QuestionDefinition" WHERE "stableKey" = 'bestSelf' AND "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')), 6, 'The reason they finally started something', 'Builder', 2, 'The reason they finally started something');

-- 5. Re-affirm the workspace default template (idempotent; matches existing seed pattern).
UPDATE "Workspace" SET "defaultTemplateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') WHERE id = 'cmpd6xckn000004jl47xpwghx';

COMMIT;
