-- NoBC apply scoring — reconcile the LIVE scored set to the canonical 13 (Apply Scoring v2).
-- Target workspace: cmpd6xckn000004jl47xpwghx   template slug: 'membership'
-- Generated 2026-07-07 from scripts/seed-questions.mjs (single source of truth).
--
-- WHAT THIS DOES (and does NOT do):
--   • STRIKES scoring (sets scoringDimension = NULL) on every scored question that is
--     NOT one of the 13 target keys and NOT one of the six In-A-Room taps. This retires
--     the taste model + investedIn + flowThrough + recommendForPay wherever prod still
--     scores them — state-agnostic (works whether prod has the old model, the clean 13,
--     or a partial).
--   • UPSERTS all 13 target scored questions to the canonical model (UPDATE existing +
--     INSERT any missing). QuestionDefinition has NO unique (templateId, stableKey), so
--     this uses UPDATE + INSERT ... WHERE NOT EXISTS, never ON CONFLICT.
--   • Points the workspace default template at 'membership'.
--
-- SAFETY (per Adam's hard rules):
--   • ZERO DELETEs. Never deletes on templateId. No cascade.
--   • Every strike carries the tap guard  AND "stableKey" NOT IN (<six taps>)  so the
--     six In-A-Room taps (roomPosition, giftMaking, partyJudge, perfectFriday, skipFriday,
--     bestSelf) are never scored, moved, or removed. They are unscored by design and stay so.
--   • Additive / targeted only. Idempotent — safe to re-run.
--   • Emitted for Adam to run in the Neon Console. Not run by the agent.

-- ─────────────────────────────────────────────────────────────────────────────
-- PRE-CHECK (run this block FIRST, on its own, to see prod's current scored set):
--
-- SELECT "stableKey", "scoringDimension", "scoringWeight", "archetypeSignals", "order"
--   FROM "QuestionDefinition"
--  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')
--    AND "scoringDimension" IS NOT NULL
--  ORDER BY "order";
--
-- Confirm the six taps are present and UNSCORED (scoringDimension must be NULL for each):
--
-- SELECT "stableKey", section, "scoringDimension"
--   FROM "QuestionDefinition"
--  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')
--    AND "stableKey" IN ('roomPosition', 'giftMaking', 'partyJudge', 'perfectFriday', 'skipFriday', 'bestSelf')
--  ORDER BY "order";
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1a) STRIKE — general. Null scoring on ANY scored question that is neither a target-13
--     key nor a tap. Catches the taste model + investedIn + flowThrough + recommendForPay
--     + any stray, without naming them. Tap-guarded.
UPDATE "QuestionDefinition" SET
  "scoringDimension" = NULL, "scoringWeight" = 0, "archetypeSignals" = ARRAY[]::text[], "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')
  AND "scoringDimension" IS NOT NULL
  AND "stableKey" NOT IN ('whatYouDo', 'comeToYouFor', 'characteristicsGoodAtJob', 'creativePursuits', 'obsessedWith', 'referrals', 'cities', 'connectionCreated', 'loyalCommunity', 'goodCompany', 'walkIntoRoom', 'unplannedFun', 'meetPeople')
  AND "stableKey" NOT IN ('roomPosition', 'giftMaking', 'partyJudge', 'perfectFriday', 'skipFriday', 'bestSelf');

-- 1b) STRIKE — named (audit trail). Same effect for the explicitly retired keys; redundant
--     with 1a but self-documenting. Tap-guarded.
UPDATE "QuestionDefinition" SET
  "scoringDimension" = NULL, "scoringWeight" = 0, "archetypeSignals" = ARRAY[]::text[], "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership')
  AND "stableKey" IN ('lastConvinced', 'loyalBrands', 'expertIn', 'brandPartner', 'detailsRight', 'trustedTaste', 'recSources', 'scrollStopping', 'splurgeSave', 'idealSaturday', 'friendDescribe', 'investedIn', 'flowThrough', 'recommendForPay')
  AND "stableKey" NOT IN ('roomPosition', 'giftMaking', 'partyJudge', 'perfectFriday', 'skipFriday', 'bestSelf');

-- 2) UPSERT the 13 target scored questions to the canonical model. None is a tap.
--    UPDATE re-asserts canonical scoring on existing rows; INSERT adds any that are missing.

-- 1. whatYouDo (influence 0.9, Builder/Patron)
UPDATE "QuestionDefinition" SET
  label = 'What do you do?', type = 'long_text', section = 'who-you-are', "order" = 1,
  required = false, "isActive" = true,
  "insightLabel" = 'what they do / what they build', "insightDescription" = 'Primary work - ownership, and whether they build, ship, or back something.',
  "scoringDimension" = 'influence', "scoringWeight" = 0.9, "scoringLogic" = 'Work that builds, ships, or backs something scores high; ownership over title; vague "employed by" low.',
  "archetypeSignals" = ARRAY['Builder', 'Patron']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'whatYouDo';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'whatYouDo', 'What do you do?', 'long_text',
  'who-you-are', 1, false, true, 'what they do / what they build', 'Primary work - ownership, and whether they build, ship, or back something.',
  'influence', 0.9, 'Work that builds, ships, or backs something scores high; ownership over title; vague "employed by" low.', ARRAY['Builder', 'Patron']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'whatYouDo');

-- 2. comeToYouFor (influence 1, Connector/Host/Builder/Patron/Sage/Spark)
UPDATE "QuestionDefinition" SET
  label = 'What do people consistently come to you for?', type = 'long_text', section = 'how-you-move', "order" = 2,
  required = false, "isActive" = true,
  "insightLabel" = 'what people rely on them for', "insightDescription" = 'ANCHOR - the answer itself drives the archetype.',
  "scoringDimension" = 'influence', "scoringWeight" = 1, "scoringLogic" = 'ANCHOR. The content decides: intros to Connector, advice/perspective to Sage, showing-up/backing to Patron, building help to Builder, tending people to Host, energy/fun to Spark. Specific repeated reliance scores high; generic scores low.',
  "archetypeSignals" = ARRAY['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'comeToYouFor';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'comeToYouFor', 'What do people consistently come to you for?', 'long_text',
  'how-you-move', 2, false, true, 'what people rely on them for', 'ANCHOR - the answer itself drives the archetype.',
  'influence', 1, 'ANCHOR. The content decides: intros to Connector, advice/perspective to Sage, showing-up/backing to Patron, building help to Builder, tending people to Host, energy/fun to Spark. Specific repeated reliance scores high; generic scores low.', ARRAY['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'comeToYouFor');

-- 3. characteristicsGoodAtJob (influence 0.6, Builder/Sage)  [NEW — adds scoring]
UPDATE "QuestionDefinition" SET
  label = 'What characteristics make you good at your job?', type = 'long_text', section = 'who-you-are', "order" = 3,
  required = false, "isActive" = true,
  "insightLabel" = 'traits that make them good at their work', "insightDescription" = 'Execution/ownership traits vs perception/judgment traits - Builder vs Sage tell.',
  "scoringDimension" = 'influence', "scoringWeight" = 0.6, "scoringLogic" = 'Execution/ownership traits point to Builder; perception/judgment/reading-people traits point to Sage. Concrete self-knowledge high; cliché low.',
  "archetypeSignals" = ARRAY['Builder', 'Sage']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'characteristicsGoodAtJob';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'characteristicsGoodAtJob', 'What characteristics make you good at your job?', 'long_text',
  'who-you-are', 3, false, true, 'traits that make them good at their work', 'Execution/ownership traits vs perception/judgment traits - Builder vs Sage tell.',
  'influence', 0.6, 'Execution/ownership traits point to Builder; perception/judgment/reading-people traits point to Sage. Concrete self-knowledge high; cliché low.', ARRAY['Builder', 'Sage']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'characteristicsGoodAtJob');

-- 4. creativePursuits (activation 0.5, Builder)
UPDATE "QuestionDefinition" SET
  label = 'Creative Pursuits and Passion Projects', type = 'long_text', section = 'who-you-are', "order" = 4,
  required = false, "isActive" = true,
  "insightLabel" = 'creative pursuits outside work', "insightDescription" = 'Active making/building vs pure consumption.',
  "scoringDimension" = 'activation', "scoringWeight" = 0.5, "scoringLogic" = 'Active making/building outside work scores high; pure consumption scores low.',
  "archetypeSignals" = ARRAY['Builder']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'creativePursuits';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'creativePursuits', 'Creative Pursuits and Passion Projects', 'long_text',
  'who-you-are', 4, false, true, 'creative pursuits outside work', 'Active making/building vs pure consumption.',
  'activation', 0.5, 'Active making/building outside work scores high; pure consumption scores low.', ARRAY['Builder']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'creativePursuits');

-- 5. obsessedWith (activation 0.6, Builder/Sage)
UPDATE "QuestionDefinition" SET
  label = 'What''s something you''ve become obsessed with?', type = 'long_text', section = 'how-you-move', "order" = 5,
  required = false, "isActive" = true,
  "insightLabel" = 'current obsession', "insightDescription" = 'Generative obsession (making/learning) plus specificity vs passive.',
  "scoringDimension" = 'activation', "scoringWeight" = 0.6, "scoringLogic" = 'Generative obsession (making/learning) plus specificity scores high; passive consumption scores low.',
  "archetypeSignals" = ARRAY['Builder', 'Sage']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'obsessedWith';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'obsessedWith', 'What''s something you''ve become obsessed with?', 'long_text',
  'how-you-move', 5, false, true, 'current obsession', 'Generative obsession (making/learning) plus specificity vs passive.',
  'activation', 0.6, 'Generative obsession (making/learning) plus specificity scores high; passive consumption scores low.', ARRAY['Builder', 'Sage']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'obsessedWith');

-- 6. referrals (contribution 0.9, Connector/Patron/Host)
UPDATE "QuestionDefinition" SET
  label = 'Who referred you?', type = 'group', section = 'who-you-are', "order" = 6,
  required = false, "isActive" = true,
  "insightLabel" = 'who referred them', "insightDescription" = 'Referral trust. Joins referral1-3 first/last names.',
  "scoringDimension" = 'contribution', "scoringWeight" = 0.9, "scoringLogic" = 'Named existing-member referrers score highest; multiple strong referrals raise contribution; vague or none scores low.',
  "archetypeSignals" = ARRAY['Connector', 'Patron', 'Host']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'referrals';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'referrals', 'Who referred you?', 'group',
  'who-you-are', 6, false, true, 'who referred them', 'Referral trust. Joins referral1-3 first/last names.',
  'contribution', 0.9, 'Named existing-member referrers score highest; multiple strong referrals raise contribution; vague or none scores low.', ARRAY['Connector', 'Patron', 'Host']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'referrals');

-- 7. cities (activation 0.3, Connector/Patron)
UPDATE "QuestionDefinition" SET
  label = 'What other cities do you spend real time in?', type = 'short_text', section = 'who-you-are', "order" = 7,
  required = false, "isActive" = true,
  "insightLabel" = 'cities they move between', "insightDescription" = 'Cross-market movement - a mild reach signal.',
  "scoringDimension" = 'activation', "scoringWeight" = 0.3, "scoringLogic" = 'Multi-market movement is a mild reach signal; a single home city is neutral.',
  "archetypeSignals" = ARRAY['Connector', 'Patron']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'cities';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'cities', 'What other cities do you spend real time in?', 'short_text',
  'who-you-are', 7, false, true, 'cities they move between', 'Cross-market movement - a mild reach signal.',
  'activation', 0.3, 'Multi-market movement is a mild reach signal; a single home city is neutral.', ARRAY['Connector', 'Patron']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'cities');

-- 8. connectionCreated (contribution 1, Connector/Patron/Host)
UPDATE "QuestionDefinition" SET
  label = 'Tell us about a connection or opportunity you helped create for someone else.', type = 'long_text', section = 'how-you-move', "order" = 8,
  required = false, "isActive" = true,
  "insightLabel" = 'a connection they created for someone', "insightDescription" = 'CORE contribution - a concrete, consequential connection.',
  "scoringDimension" = 'contribution', "scoringWeight" = 1, "scoringLogic" = 'CORE contribution. A concrete consequential connection created for someone else scores highest; hypothetical or self-serving scores low.',
  "archetypeSignals" = ARRAY['Connector', 'Patron', 'Host']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'connectionCreated';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'connectionCreated', 'Tell us about a connection or opportunity you helped create for someone else.', 'long_text',
  'how-you-move', 8, false, true, 'a connection they created for someone', 'CORE contribution - a concrete, consequential connection.',
  'contribution', 1, 'CORE contribution. A concrete consequential connection created for someone else scores highest; hypothetical or self-serving scores low.', ARRAY['Connector', 'Patron', 'Host']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'connectionCreated');

-- 9. loyalCommunity (contribution 0.7, Host/Connector)
UPDATE "QuestionDefinition" SET
  label = 'Tell us about a group or community you''ve stayed loyal to - and what keeps you there?', type = 'long_text', section = 'how-you-move', "order" = 9,
  required = false, "isActive" = true,
  "insightLabel" = 'a community they stayed loyal to', "insightDescription" = 'Sustained investment in a group plus a clear reason.',
  "scoringDimension" = 'contribution', "scoringWeight" = 0.7, "scoringLogic" = 'Sustained investment in a group plus a clear reason scores high; transactional membership scores low.',
  "archetypeSignals" = ARRAY['Host', 'Connector']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'loyalCommunity';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'loyalCommunity', 'Tell us about a group or community you''ve stayed loyal to - and what keeps you there?', 'long_text',
  'how-you-move', 9, false, true, 'a community they stayed loyal to', 'Sustained investment in a group plus a clear reason.',
  'contribution', 0.7, 'Sustained investment in a group plus a clear reason scores high; transactional membership scores low.', ARRAY['Host', 'Connector']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'loyalCommunity');

-- 10. goodCompany (contribution 0.6, Host/Connector)
UPDATE "QuestionDefinition" SET
  label = 'How do you know when you''re in good company?', type = 'long_text', section = 'how-you-move', "order" = 10,
  required = false, "isActive" = true,
  "insightLabel" = 'how they recognize good company', "insightDescription" = 'Values centering generosity and presence vs status/access-only.',
  "scoringDimension" = 'contribution', "scoringWeight" = 0.6, "scoringLogic" = 'Values centering mutual generosity and presence score high; status or access-only framing scores low.',
  "archetypeSignals" = ARRAY['Host', 'Connector']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'goodCompany';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'goodCompany', 'How do you know when you''re in good company?', 'long_text',
  'how-you-move', 10, false, true, 'how they recognize good company', 'Values centering generosity and presence vs status/access-only.',
  'contribution', 0.6, 'Values centering mutual generosity and presence score high; status or access-only framing scores low.', ARRAY['Host', 'Connector']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'goodCompany');

-- 11. walkIntoRoom (activation 0.9, Connector/Host/Builder/Patron/Sage/Spark)
UPDATE "QuestionDefinition" SET
  label = 'You walk into a room where you don''t know anyone. What do you actually do?', type = 'long_text', section = 'how-you-move', "order" = 11,
  required = false, "isActive" = true,
  "insightLabel" = 'what they do walking into a room of strangers', "insightDescription" = 'NEUTRAL DISCRIMINATOR - behavior sorts the archetype.',
  "scoringDimension" = 'activation', "scoringWeight" = 0.9, "scoringLogic" = 'NEUTRAL DISCRIMINATOR. Behavior sorts: works-the-room / first-to-talk to Spark, finds-the-person-alone to Host, maps-who-should-meet to Connector, reads-the-room-first to Sage, finds-their-person to Patron, assesses-the-space / setup to Builder. Reward specificity; generic "I mingle" scores low.',
  "archetypeSignals" = ARRAY['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'walkIntoRoom';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'walkIntoRoom', 'You walk into a room where you don''t know anyone. What do you actually do?', 'long_text',
  'how-you-move', 11, false, true, 'what they do walking into a room of strangers', 'NEUTRAL DISCRIMINATOR - behavior sorts the archetype.',
  'activation', 0.9, 'NEUTRAL DISCRIMINATOR. Behavior sorts: works-the-room / first-to-talk to Spark, finds-the-person-alone to Host, maps-who-should-meet to Connector, reads-the-room-first to Sage, finds-their-person to Patron, assesses-the-space / setup to Builder. Reward specificity; generic "I mingle" scores low.', ARRAY['Connector', 'Host', 'Builder', 'Patron', 'Sage', 'Spark']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'walkIntoRoom');

-- 12. unplannedFun (activation 0.6, Spark)  [NEW — adds scoring]
UPDATE "QuestionDefinition" SET
  label = 'What''s the most fun you''ve had recently that wasn''t planned?', type = 'long_text', section = 'how-you-move', "order" = 12,
  required = false, "isActive" = true,
  "insightLabel" = 'their best unplanned recent fun', "insightDescription" = 'The say-yes instinct - ease and specificity of a spontaneous story.',
  "scoringDimension" = 'activation', "scoringWeight" = 0.6, "scoringLogic" = 'Ease and specificity of a spontaneous story scores high; can''t-recall or reframed-as-planned scores low. Catches the say-yes instinct.',
  "archetypeSignals" = ARRAY['Spark']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'unplannedFun';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'unplannedFun', 'What''s the most fun you''ve had recently that wasn''t planned?', 'long_text',
  'how-you-move', 12, false, true, 'their best unplanned recent fun', 'The say-yes instinct - ease and specificity of a spontaneous story.',
  'activation', 0.6, 'Ease and specificity of a spontaneous story scores high; can''t-recall or reframed-as-planned scores low. Catches the say-yes instinct.', ARRAY['Spark']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'unplannedFun');

-- 13. meetPeople (contribution 0.4, Connector/Spark)  [NEW — adds scoring]
UPDATE "QuestionDefinition" SET
  label = 'Where do you meet new people?', type = 'long_text', section = 'how-you-move', "order" = 13,
  required = false, "isActive" = true,
  "insightLabel" = 'where they meet new people', "insightDescription" = 'Rich people-oriented sources vs thin or purely online.',
  "scoringDimension" = 'contribution', "scoringWeight" = 0.4, "scoringLogic" = 'Rich people-oriented sources (hobbies, gatherings, through-friends) score high; thin or purely online scores low.',
  "archetypeSignals" = ARRAY['Connector', 'Spark']::text[], "sponsorRelevance" = NULL, "updatedAt" = now()
WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'meetPeople';

INSERT INTO "QuestionDefinition"
  (id, "workspaceId", "templateId", "stableKey", label, type, section, "order", required, "isActive",
   "insightLabel", "insightDescription", "scoringDimension", "scoringWeight", "scoringLogic",
   "archetypeSignals", "sponsorRelevance", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'cmpd6xckn000004jl47xpwghx', (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership'), 'meetPeople', 'Where do you meet new people?', 'long_text',
  'how-you-move', 13, false, true, 'where they meet new people', 'Rich people-oriented sources vs thin or purely online.',
  'contribution', 0.4, 'Rich people-oriented sources (hobbies, gatherings, through-friends) score high; thin or purely online scores low.', ARRAY['Connector', 'Spark']::text[], NULL, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "QuestionDefinition"
  WHERE "templateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') AND "stableKey" = 'meetPeople');

-- 3) Point the workspace's default template at 'membership' (so lib/scoring.ts resolves it).
UPDATE "Workspace" SET "defaultTemplateId" = (SELECT id FROM "ApplicationTemplate" WHERE "workspaceId" = 'cmpd6xckn000004jl47xpwghx' AND slug = 'membership') WHERE id = 'cmpd6xckn000004jl47xpwghx';

COMMIT;
