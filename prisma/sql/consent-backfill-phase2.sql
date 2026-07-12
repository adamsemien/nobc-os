-- ═══════════════════════════════════════════════════════════════════════════
-- NEON SQL — CONSENT RECONCILIATION, PHASE 2 BACKFILL (2026-07-11).
--
-- RUN IN THE NEON CONSOLE. Adam runs this by hand; the build that emitted it
-- made ZERO database contact. Emitted against the 2026-07-11 prod census:
--
--   ChannelSubscription  = 10 rows, ALL PENDING (5 members x 2 channels),
--                          zero person-keyed rows
--   SuppressionEntry     = empty          SuppressedContact = empty
--   Members              = 8 total, 2 without a Person
--   Blast-eligible       = 2 members EMAIL (marketingEmailOptIn = true),
--                          2 members SMS  (marketingSmsOptIn  = true),
--                          0 covered by a SUBSCRIBED row
--
-- WHAT IT DOES (locked decisions 1 + 4): for exactly the blast-eligible
-- members, write SUBSCRIBED rows in BOTH keyings — the person-keyed canonical
-- row (memberId NULL) where a Person exists, and the member-keyed mirror.
-- Basis = EXPRESS_OPTIN where timestamp evidence exists (marketing*OptInAt
-- NOT NULL), IMPORTED_LEGACY otherwise. Nothing is downgraded; the remaining
-- PENDING rows stay PENDING (absence of signal, not refusal). No suppression
-- rows are touched (both suppression tables are empty by census).
--
-- Idempotent: UPDATEs are stable under re-run; INSERTs are guarded by
-- NOT EXISTS. Transactional: one BEGIN/COMMIT, no DDL inside.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Member-keyed mirrors: elevate existing PENDING rows ──────────────────
-- EMAIL
UPDATE "ChannelSubscription" cs
SET "status"        = 'SUBSCRIBED',
    "consentBasis"  = CASE WHEN m."marketingEmailOptInAt" IS NOT NULL
                           THEN 'EXPRESS_OPTIN'::"ConsentBasis"
                           ELSE 'IMPORTED_LEGACY'::"ConsentBasis" END,
    "consentSource" = 'member_profile:backfill-phase2',
    "consentAt"     = m."marketingEmailOptInAt",
    "personId"      = COALESCE(cs."personId", m."personId"),
    "syncedAt"      = NOW(),
    "updatedAt"     = NOW()
FROM "Member" m
WHERE cs."memberId" = m."id"
  AND cs."workspaceId" = m."workspaceId"
  AND cs."channel" = 'EMAIL' AND cs."stream" = '*'
  AND m."marketingEmailOptIn" = true;

-- SMS
UPDATE "ChannelSubscription" cs
SET "status"        = 'SUBSCRIBED',
    "consentBasis"  = CASE WHEN m."marketingSmsOptInAt" IS NOT NULL
                           THEN 'EXPRESS_OPTIN'::"ConsentBasis"
                           ELSE 'IMPORTED_LEGACY'::"ConsentBasis" END,
    "consentSource" = 'member_profile:backfill-phase2',
    "consentAt"     = m."marketingSmsOptInAt",
    "personId"      = COALESCE(cs."personId", m."personId"),
    "syncedAt"      = NOW(),
    "updatedAt"     = NOW()
FROM "Member" m
WHERE cs."memberId" = m."id"
  AND cs."workspaceId" = m."workspaceId"
  AND cs."channel" = 'SMS' AND cs."stream" = '*'
  AND m."marketingSmsOptIn" = true;

-- ── 2. Member-keyed mirrors: insert where the eligible member has no row ────
-- EMAIL
INSERT INTO "ChannelSubscription"
  ("id", "workspaceId", "memberId", "personId", "channel", "stream", "status",
   "consentBasis", "consentSource", "consentAt", "syncedAt", "createdAt", "updatedAt")
SELECT
  'csbf2_' || replace(gen_random_uuid()::text, '-', ''),
  m."workspaceId", m."id", m."personId", 'EMAIL', '*', 'SUBSCRIBED',
  CASE WHEN m."marketingEmailOptInAt" IS NOT NULL
       THEN 'EXPRESS_OPTIN'::"ConsentBasis" ELSE 'IMPORTED_LEGACY'::"ConsentBasis" END,
  'member_profile:backfill-phase2', m."marketingEmailOptInAt", NOW(), NOW(), NOW()
FROM "Member" m
WHERE m."marketingEmailOptIn" = true
  AND NOT EXISTS (
    SELECT 1 FROM "ChannelSubscription" cs
    WHERE cs."workspaceId" = m."workspaceId" AND cs."memberId" = m."id"
      AND cs."channel" = 'EMAIL' AND cs."stream" = '*');

-- SMS
INSERT INTO "ChannelSubscription"
  ("id", "workspaceId", "memberId", "personId", "channel", "stream", "status",
   "consentBasis", "consentSource", "consentAt", "syncedAt", "createdAt", "updatedAt")
SELECT
  'csbf2_' || replace(gen_random_uuid()::text, '-', ''),
  m."workspaceId", m."id", m."personId", 'SMS', '*', 'SUBSCRIBED',
  CASE WHEN m."marketingSmsOptInAt" IS NOT NULL
       THEN 'EXPRESS_OPTIN'::"ConsentBasis" ELSE 'IMPORTED_LEGACY'::"ConsentBasis" END,
  'member_profile:backfill-phase2', m."marketingSmsOptInAt", NOW(), NOW(), NOW()
FROM "Member" m
WHERE m."marketingSmsOptIn" = true
  AND NOT EXISTS (
    SELECT 1 FROM "ChannelSubscription" cs
    WHERE cs."workspaceId" = m."workspaceId" AND cs."memberId" = m."id"
      AND cs."channel" = 'SMS' AND cs."stream" = '*');

-- ── 3. Person-keyed CANONICAL rows (memberId NULL) for eligible members ─────
-- DISTINCT ON guards the (unlikely at this scale) case of two eligible
-- members sharing one Person. Skips the census's 2 person-less members —
-- they stay member-keyed only until a Person exists (locked decision 1).
-- EMAIL
INSERT INTO "ChannelSubscription"
  ("id", "workspaceId", "memberId", "personId", "channel", "stream", "status",
   "consentBasis", "consentSource", "consentAt", "syncedAt", "createdAt", "updatedAt")
SELECT DISTINCT ON (m."workspaceId", m."personId")
  'csbf2_' || replace(gen_random_uuid()::text, '-', ''),
  m."workspaceId", NULL, m."personId", 'EMAIL', '*', 'SUBSCRIBED',
  CASE WHEN m."marketingEmailOptInAt" IS NOT NULL
       THEN 'EXPRESS_OPTIN'::"ConsentBasis" ELSE 'IMPORTED_LEGACY'::"ConsentBasis" END,
  'member_profile:backfill-phase2', m."marketingEmailOptInAt", NOW(), NOW(), NOW()
FROM "Member" m
WHERE m."marketingEmailOptIn" = true AND m."personId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ChannelSubscription" cs
    WHERE cs."workspaceId" = m."workspaceId" AND cs."personId" = m."personId"
      AND cs."memberId" IS NULL AND cs."channel" = 'EMAIL' AND cs."stream" = '*')
ORDER BY m."workspaceId", m."personId", m."marketingEmailOptInAt" DESC NULLS LAST;

-- SMS
INSERT INTO "ChannelSubscription"
  ("id", "workspaceId", "memberId", "personId", "channel", "stream", "status",
   "consentBasis", "consentSource", "consentAt", "syncedAt", "createdAt", "updatedAt")
SELECT DISTINCT ON (m."workspaceId", m."personId")
  'csbf2_' || replace(gen_random_uuid()::text, '-', ''),
  m."workspaceId", NULL, m."personId", 'SMS', '*', 'SUBSCRIBED',
  CASE WHEN m."marketingSmsOptInAt" IS NOT NULL
       THEN 'EXPRESS_OPTIN'::"ConsentBasis" ELSE 'IMPORTED_LEGACY'::"ConsentBasis" END,
  'member_profile:backfill-phase2', m."marketingSmsOptInAt", NOW(), NOW(), NOW()
FROM "Member" m
WHERE m."marketingSmsOptIn" = true AND m."personId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ChannelSubscription" cs
    WHERE cs."workspaceId" = m."workspaceId" AND cs."personId" = m."personId"
      AND cs."memberId" IS NULL AND cs."channel" = 'SMS' AND cs."stream" = '*')
ORDER BY m."workspaceId", m."personId", m."marketingSmsOptInAt" DESC NULLS LAST;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — census re-runs. Run AFTER the commit; expected results are
-- stated against the 2026-07-11 census above.
-- ═══════════════════════════════════════════════════════════════════════════

-- V1. Status breakdown by keying.
--   EXPECTED: member-keyed SUBSCRIBED = 4 (2 EMAIL + 2 SMS, regardless of
--   whether the EMAIL and SMS members overlap). person-keyed SUBSCRIBED = one
--   per DISTINCT (person, channel) pair among eligible members that HAVE a
--   Person: 4 when all four eligible pairs belong to distinct person-linked
--   members; each eligible pair on a person-less member or shared Person
--   reduces it by one. member-keyed PENDING = 10 minus the eligible pairs
--   that already had a PENDING row (so 6, 7, 8, 9, or 10 - the exact number
--   the census did not pin; V4 reconciles it). person-keyed PENDING = 0.
SELECT ("memberId" IS NOT NULL) AS member_keyed, "status", COUNT(*)
FROM "ChannelSubscription"
GROUP BY 1, 2 ORDER BY 1, 2;

-- V2. Blast-eligible covered by a SUBSCRIBED row (census Q9 re-run).
--   EXPECTED: EMAIL covered = 2 of 2, SMS covered = 2 of 2  (census: 0 of 2 each).
SELECT 'EMAIL' AS channel,
       COUNT(*) FILTER (WHERE m."marketingEmailOptIn") AS eligible,
       COUNT(*) FILTER (WHERE m."marketingEmailOptIn" AND EXISTS (
         SELECT 1 FROM "ChannelSubscription" cs
         WHERE cs."workspaceId" = m."workspaceId" AND cs."memberId" = m."id"
           AND cs."channel" = 'EMAIL' AND cs."stream" = '*'
           AND cs."status" = 'SUBSCRIBED')) AS covered
FROM "Member" m
UNION ALL
SELECT 'SMS',
       COUNT(*) FILTER (WHERE m."marketingSmsOptIn"),
       COUNT(*) FILTER (WHERE m."marketingSmsOptIn" AND EXISTS (
         SELECT 1 FROM "ChannelSubscription" cs
         WHERE cs."workspaceId" = m."workspaceId" AND cs."memberId" = m."id"
           AND cs."channel" = 'SMS' AND cs."stream" = '*'
           AND cs."status" = 'SUBSCRIBED'))
FROM "Member" m;

-- V3. Basis honesty: every backfilled SUBSCRIBED row's basis matches its
--   timestamp evidence.  EXPECTED: 0 rows.
SELECT cs."id", cs."channel", cs."consentBasis", cs."consentAt"
FROM "ChannelSubscription" cs
WHERE cs."consentSource" = 'member_profile:backfill-phase2'
  AND ((cs."consentAt" IS NOT NULL AND cs."consentBasis" <> 'EXPRESS_OPTIN')
    OR (cs."consentAt" IS NULL     AND cs."consentBasis" <> 'IMPORTED_LEGACY'));

-- V4. Full reconciliation of the row math (prints the exact counts V1 leaves
--   open).  EXPECTED: total = 10 + inserted_member_keyed + inserted_person_keyed,
--   where inserted_member_keyed = 4 - (eligible pairs that already had a row).
SELECT
  (SELECT COUNT(*) FROM "ChannelSubscription")                                        AS total_rows,
  (SELECT COUNT(*) FROM "ChannelSubscription"
    WHERE "consentSource" = 'member_profile:backfill-phase2')                          AS backfill_touched,
  (SELECT COUNT(*) FROM "ChannelSubscription"
    WHERE "consentSource" = 'member_profile:backfill-phase2' AND "memberId" IS NULL)   AS person_keyed_canonical,
  (SELECT COUNT(*) FROM "ChannelSubscription"
    WHERE "id" LIKE 'csbf2_%')                                                         AS inserted_by_backfill;

-- V5. Suppression floors untouched.  EXPECTED: 0 and 0 (census: both empty).
SELECT (SELECT COUNT(*) FROM "SuppressionEntry")  AS suppression_entries,
       (SELECT COUNT(*) FROM "SuppressedContact") AS suppressed_contacts;
