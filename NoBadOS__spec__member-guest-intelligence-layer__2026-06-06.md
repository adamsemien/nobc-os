# NoBC OS — Member & Guest Intelligence Layer

**Spec + implementation plan. Plan-first artifact, 2026-06-06.**
Author session: read-only design pass against `main @ 5e26ff1`.
Status: DRAFT — awaiting Adam's approval. No code, schema, or migrations were written this session.

---

## 0. Purpose

Turn the member/guest data NoBC already captures into a fast, flexible, AI-ready CRM that tracks **demographic, firmographic, and psychographic** signal across one continuous identity: **guest → applicant → member**. This is the differentiator no competitor has: enriched member CRM fused with curation + sponsor intelligence, on the same record.

The design principle throughout: **clean structured data first, AI on top.** The AI query/scoring layer (V1.5, Vanna) must sit on top of normalized, provenance-tagged columns, never in place of them. Sponsor-facing numbers must be honest and traceable, never invented.

---

## 1. Current State (verified against the codebase)

### 1.1 What we capture today, and where

**`Member` (`prisma/schema.prisma`)** — the de-facto person record.
- Identity: `id` (cuid), `workspaceId`, `clerkUserId`, `email`, `firstName`, `lastName`, `phone`, `status` (`MemberStatus`), `memberQrCode` (unique), `walletPassId`.
- Uniqueness: `@@unique([workspaceId, email])` and `@@unique([workspaceId, clerkUserId])`. **`(workspaceId, email)` is the de-facto canonical identity key.**
- Scoring: `energyScore`, `networkValueScore`, `networkCapitalScore`, `aiSummary`.
- Engagement rollups: `totalEventsAttended`, `lastAttendedDate`.
- Referral: `referredByMemberId` (self-relation `MemberReferrals`), giving who-referred-whom.
- Firmographic / demographic (added for sponsor intel): `industry`, `jobFunction`, `seniority`, `companySize`, `ageRange`, `householdIncome`. All free-string, **all self-reported/enriched with no provenance flag.**
- Red List: `redListed Boolean`.
- Relations: `rsvps`, `tickets`, `waitlistEntries`, `engagementEvents`, `surveyResponses`.

**`Application`** — applicant record, **separate table** from Member.
- `memberId String?` (nullable, **not populated at submission today**), `email`, `fullName`, `phone`, `city`, `neighborhood`, `referredBy`, consent flags.
- AI/curation: `aiTags[]`, `aiScore`, `aiRecommendation`, `aiReasoning`, `duplicateFlag`, **`archetype`**, **`archetypeScores Json`** (psychographic), `personalizedCopy`, `templateId`.
- Note: `city`/`neighborhood` live here but **not on Member**.

**`RSVP`** — event access record (one per person per event).
- `memberId` (required FK to Member), `eventId`, `status` (`RSVPStatus`), `ticketStatus`, `origin`, `isComp`, `compType`, payment fields, `checkedIn`/`checkedInAt`.
- Guest fields: `guestEmail`, `guestName`, plus per-attendee `attendeeName/Email/Phone` for group buys, plus `plusOneName`/`plusOneInstagram`.

**`MemberEngagementEvent`** — the existing CRM-style event stream.
- `memberId` (**required** FK), `eventType` (`MemberEngagementEventType` enum), `eventId?`, `metadata Json?`, `occurredAt`.
- Indexed on `workspaceId`, `memberId`, `occurredAt` — already shaped for per-person timeline + aggregate rollups.
- Current enum values: `rsvp_confirmed`, `rsvp_cancelled`, `checked_in`, `waitlist_joined`, `waitlist_promoted`, `application_submitted`, `newsletter_opened`, `sponsor_perk_clicked`.

**`AuditEvent`** — generic operational/compliance log.
- `actorId`, `actorType` (`AuditActorType`: OPERATOR/AGENT/MEMBER/SYSTEM), `action` (free string), `entityType`, `entityId`, `metadata`. Indexed `[entityType, entityId]`. Append-only, **no person FK, no typed person vocabulary.**

**`Tag` + `EntityTag`** — polymorphic tagging with external-sync identity.
- `Tag.externalSource` (`TagSource`: manual/**tenur**/**activecampaign**/**beehiiv**/system), `Tag.externalId`, `@@unique([workspaceId, externalSource, externalId])`.
- `EntityTag` polymorphic join (`TagEntityType`: member/event/series/order/application/rsvp), `appliedBy`, `appliedAt`. **The external marketing-sync hook already exists at the tag layer.**

**`WatchList`** — Red List / dedupe matcher. `type` (PURPLE/BLOCKED), `matchEmail`, `matchPhone`, `matchInstagram`, soft-delete. The match keys for human dedupe already exist here.

**Lifecycle code:**
- Guest creation: `lib/event-access-submit.ts` mints `Member(status=GUEST)` for non-member registrants/buyers; `generateMemberQrCode()` (`lib/member-qr.ts`) is the single QR mint path. Also `check-in/walkin`, `AddMemberDrawer`, `lib/mcp/legacy-tools.ts`.
- Promotion: `lib/applications/approve.ts` **upserts Member by `(workspaceId, email)`** → flips GUEST/new → `APPROVED`, mints QR, fires wallet pass + welcome email, emits `application.approved` + `member.created` via `emitEvent`.
- `emitEvent` (`lib/emit-event.ts`) writes `AuditEvent` **always**, and delivers to Svix if configured. **It does NOT write `MemberEngagementEvent`** — that table is written elsewhere/sparsely.

**Operator surfaces (`app/operator/`):** `members/` (`[id]`, `_components`, `page.tsx`), `applications/`, `intelligence/` (`page.tsx`, `recap/`, `sponsor/`), `audit/`, `check-in/`, `events/`, `house-phone/`, `media/`, `settings/`, `team/`.

### 1.2 Gaps vs a top-class lifecycle CRM

1. **No unified-identity guarantee.** `Application.memberId` is not populated at submission, so a guest who applies is only re-joined to their guest history **if the email matches** at approval (upsert-on-email). Mismatched email/phone → split person, split event history. WatchList has the match keys but is not used to auto-link/merge.
2. **Pure-guest attendees can be personless.** `RSVP.guestEmail`/`attendeeEmail` (plus-ones, group-buy attendees) may exist with **no Member row**, so they never enter the engagement timeline or the funnel.
3. **Event stream is member-only and thin.** `MemberEngagementEvent.memberId` is required (fine, since guests are Members(GUEST)), but the enum misses most lifecycle moments (guest_created, application_approved/rejected, comp_issued, ticket_purchased, referral_made, enrichment_synced), and `emitEvent` doesn't populate it. Funnel/timeline today must scrape `AuditEvent` strings.
4. **No enrichment provenance.** Firmographic/demographic fields are free strings with no `source` (self-reported vs operator vs AI-inferred vs verified) and no `lastSynced`. **This is fatal for sponsor credibility** — we cannot prove a number is real.
5. **No live enrichment integration.** Only the `TagSource.tenur` enum value + seed/demo references exist. No sync code, no scheduler. **Decision (2026-06-06): NoBC builds its own enrichment engine; Tenur is deferred and optional (may return later as one enrichment source feeding `verified_enrichment`).** The `TagSource.tenur` enum value stays (harmless) but is not a dependency.
6. **Psychographic firewall is by-convention only — and at risk.** Archetype lives on `Application` (`archetype`, `archetypeScores`). `app/operator/intelligence/sponsor/page.tsx` **currently reads `archetypeScores`** and renders `archetypeAverages`. That page is operator-facing, but archetype computation living in a file named `sponsor` is dangerous proximity; there is **no data-layer guarantee** that psychographic data cannot reach a sponsor-facing export (recap PDF / `/doc/[token]` / `/assets/[token]` / future public API).
7. **No `city`/`country` on Member** (only on Application), so demographic geo isn't queryable on the person.
8. **No CRM segment/aggregate surface** and the per-person `members/[id]` page is not a full lifecycle CRM record.

> Note: the prompt assumed fields `tenurContactId`, `enrichmentLastSynced`, `referralYield`, `operatorNotesSummary`, `interests`, and a `DirectoryPerson` model. **None exist.** The unified person is the `Member` table itself.

---

## 2. The Intelligence Layer — Design

### 2.1 Unified identity & lifecycle

**Decision: do NOT introduce `DirectoryPerson`.** Every `RSVP`, `EntityTag`, `MemberEngagementEvent`, `Ticket`, and `WaitlistEntry` FK already points at `Member`. A separate person table would be a non-additive, FK-rewriting refactor across the whole schema and would break the additive-only constraint. Instead, **formalize Member as the canonical Person**, spanning the lifecycle via `status` plus a few additive links.

**Canonical identity key:** `(workspaceId, normalized(email))`, with `phone` and `instagram` as secondary match keys (same keys `WatchList` already uses).

**Lifecycle, made continuous (all additive):**
1. **Guest created** (`event-access-submit`, walk-in, group-buy attendee): ensure **every** attendee gets a `Member(status=GUEST)` — close gap #2 by minting a GUEST member for `guestEmail`/`attendeeEmail` rows that lack one (this is the direction `stash@{2}` member-qr rollout already points). Emit `guest_created`.
2. **Application submitted:** populate `Application.memberId` at submission by matching/ upserting the GUEST Member on the identity key, so identity is linked **before** approval, not only at it. Emit `application_submitted` against that memberId.
3. **Approved:** existing `approveApplication` upsert promotes the same Member GUEST→APPROVED, preserving all RSVP/engagement history. Emit `application_approved` + (if new) `member_created`.
4. **Merge/dedupe:** add `Member.mergedIntoId String?` self-relation (additive). When two Member rows are the same human (guest email A + member email B), an operator (or an auto-suggester fed by `WatchList` match keys + `Application.duplicateFlag`) sets the loser's `mergedIntoId`; reads resolve through it and timelines union. No row deletion, fully additive, reversible.

`MemberStatus` already encodes the stage (PENDING/APPROVED/REJECTED/WAITLISTED/GUEST). We **derive** "lifecycle stage" from `status` + application linkage rather than adding a parallel field, to avoid two sources of truth. (Optional `ALUMNI`/`LAPSED` can be added later as additive enum values if churn tracking is needed.)

### 2.2 Three data dimensions + firewall

| Dimension | Fields (existing + additive) | Audience | Firewall |
|---|---|---|---|
| **Firmographic** | `industry`, `jobFunction`, `seniority`, `companySize` (exist) + add `companyName`, `companyDomain`, `linkedinUrl` | **Sponsor-facing, deep** | Allowed in sponsor surfaces, provenance-gated |
| **Demographic** | `ageRange`, `householdIncome` (exist) + add `city`, `country` | **Sponsor-facing in AGGREGATE only** | Per-person demographic never leaves operator surfaces; only bucketed aggregates reach sponsors |
| **Psychographic** | `archetype`, `archetypeScores`, + add `interests String[]`, `tasteSignals Json` (move/copy archetype onto Member from Application) | **INTERNAL / applicant-facing only** | **Hard-firewalled at the data layer** |

**Firewall enforced at the data/query layer, not just UI:**
- Create a Postgres **view `sponsor_audience_member`** (additive, out-of-band SQL like `Asset_searchVector_idx`) that selects **only** firmographic + coarse demographic columns + provenance, and **physically omits** `archetype*`, `interests`, `tasteSignals`, `aiSummary`, `energyScore`, raw `householdIncome`. Sponsor-facing code (recap assembly, `/doc`, `/assets`, public API) may read **only** this view.
- Add a code boundary `lib/intelligence/sponsor-safe.ts` exporting a type that structurally cannot carry psychographic fields, plus a unit test that fails if any sponsor-facing module imports `archetype`/`interests`/`tasteSignals`/the raw Member model.
- **Remediation flagged:** move the `archetypeAverages` computation out of `app/operator/intelligence/sponsor/page.tsx` (or rename the surface) and assert via test that archetype never reaches recap/exports. (Operator may still see archetype on a clearly operator-internal page; sponsors never can.)
- Honesty rule: sponsor aggregates draw **only** from `self_reported` + `verified_enrichment` provenance, never `ai_inferred`, and suppress any bucket below a small-N threshold.

### 2.3 Event-stream tracking

**Decision: extend the purpose-built `MemberEngagementEvent`, do NOT overload `audit_events`.**

Rationale: `MemberEngagementEvent` already has a person FK (`memberId`), a typed event vocabulary, and an `occurredAt` index — exactly what per-person timelines, the guest→member funnel, and sponsor aggregate rollups need. `AuditEvent` is actor/compliance-centric, has no person FK, and stores `action` as a free string keyed by `(entityType, entityId)` — querying a person's journey from it means string-scraping. Keep `AuditEvent` for compliance/audit; make `MemberEngagementEvent` the **canonical CRM timeline**.

Changes (additive):
- **Expand `MemberEngagementEventType`** with: `guest_created`, `application_approved`, `application_rejected`, `comp_issued`, `access_requested`, `ticket_purchased`, `plus_one_added`, `referral_made`, `enrichment_synced`, `merged`. (`ALTER TYPE ADD VALUE` — additive; see schema notes for the run caveat.)
- **Dual-write from `emitEvent`:** where a `memberId` is resolvable, also insert a `MemberEngagementEvent`. Keep the `AuditEvent` write unchanged. One funnel/timeline source, no double bookkeeping for callers.
- Feeds three consumers off one table: (1) guest→member conversion funnel, (2) sponsor aggregates (via the firewalled view joined to engagement counts), (3) the per-person operator CRM timeline.

### 2.4 Enrichment pipeline

- **Provenance, per field.** Add `Member.enrichment Json` storing `{ field: { value, source, confidence, syncedAt } }` where `source ∈ self_reported | operator_entered | ai_inferred | verified_enrichment`, plus scalar `Member.enrichmentLastSyncedAt DateTime?` and `Member.enrichmentStatus` (new enum: `NONE | PENDING | PARTIAL | COMPLETE | STALE`). JSON keeps it additive and flexible for V1; can normalize to a `MemberFieldProvenance` table in Phase 2 if query needs demand.
- **Triggers:** on GUEST member creation (`event-access-submit`), on application submit, and on a schedule (reuse the existing Vercel cron pattern, e.g. `/api/cron/enrichment-refresh`), re-syncing rows where `enrichmentLastSyncedAt` is older than N days or `enrichmentStatus=STALE`.
- **Sources:** NoBC's **own enrichment engine** (built in-house) is the primary path. Self-reported comes from `/apply` answers and registration fields (`self_reported`); operator edits are `operator_entered`; the in-house engine writes `ai_inferred` (AI/heuristic) or `verified_enrichment` (deterministic lookups we control), and `ai_inferred` is **excluded from sponsor aggregates by default**. **Tenur is deferred/optional** — if adopted later it plugs in as one more `verified_enrichment` source behind the same provenance contract; nothing in V1 depends on it.
- **Honesty:** sponsor numbers never include `ai_inferred`. Provenance is surfaced in the operator CRM record so staff can see what is real vs guessed.

### 2.5 AI layer (data-readiness only this milestone)

Spec the data so V1.5 NL queries (Vanna) drop in: normalized columns, the firewalled `sponsor_audience_member` view, the typed `MemberEngagementEvent` vocabulary, and a written **schema dictionary** (column → meaning → audience → provenance). Existing scores (`energyScore`, `networkValueScore`, `networkCapitalScore`) remain derived **on top of** the structured data. **Do not build the NL query engine now.**

### 2.6 Marketing-tool integration

API/Zapier-first. The clean read surface to expose (V1.5 public API + Zapier): `people` (firewalled — no psychographic in the public/sponsor scope), `events`, `timeline` (from `MemberEngagementEvent`), `segments`. Auth via workspace API key; psychographic fields available **only** on the internal operator API scope, never the public/marketing scope. `Tag.externalSource` + `EntityTag` already model external segment identity (Tenur/ActiveCampaign/Beehiiv), so connectors map cleanly later. **No hand-built Mailchimp/AC connectors this milestone** — native connectors are Phase 2, on tenant demand.

### 2.7 Operator surface

- **Per-person CRM record** — upgrade `app/operator/members/[id]`: identity header with derived lifecycle-stage badge + Red List flag; firmographic panel; demographic panel; **psychographic panel (operator-only)**; the engagement **timeline** (from `MemberEngagementEvent`); referral tree (`referredByMember`/`referredMembers`); enrichment provenance with source badges; tags; notes.
- **Aggregate / segment view** — under `app/operator/intelligence/`, an "Audience" view: guest→member funnel, dimension breakdowns, saved segments. When rendered in any sponsor context it reads the firewalled view only.
- **Recommended home:** a new stage `_context/16-member-intelligence/` (created via the `nobc-icm` skill on approval), since this spans identity + event stream + enrichment + CRM surface and doesn't fit cleanly inside 07 or 12. Cross-references 02 (apply/approval), 04 (access), 07 (operator), 12 (intelligence/sponsor).

---

## 3. Additive schema changes (proposed — NOT executed)

All changes are additive. **Items touching existing models are flagged for your review.** No `db push`. The ritual for each: edit `schema.prisma` → `prisma generate` → `prisma migrate diff --script` to review → `prisma db execute --file <sql>`. View + enum-value additions go in `prisma/sql/*.sql` (out-of-band, like the DAM GIN index).

### 3.1 `Member` — new columns ⚠️ touches existing model
```sql
ALTER TABLE "Member"
  ADD COLUMN "companyName"          TEXT,
  ADD COLUMN "companyDomain"        TEXT,
  ADD COLUMN "linkedinUrl"          TEXT,
  ADD COLUMN "city"                 TEXT,
  ADD COLUMN "country"              TEXT,
  ADD COLUMN "interests"           TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "tasteSignals"         JSONB,
  ADD COLUMN "archetype"            TEXT,
  ADD COLUMN "archetypeScores"      JSONB,
  ADD COLUMN "enrichment"           JSONB,
  ADD COLUMN "enrichmentLastSyncedAt" TIMESTAMP(3),
  ADD COLUMN "enrichmentStatus"     "MemberEnrichmentStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "mergedIntoId"         TEXT;
-- self-relation FK for soft-merge (additive)
ALTER TABLE "Member"
  ADD CONSTRAINT "Member_mergedIntoId_fkey"
  FOREIGN KEY ("mergedIntoId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Member_mergedIntoId_idx" ON "Member"("mergedIntoId");
CREATE INDEX "Member_enrichmentStatus_idx" ON "Member"("enrichmentStatus");
```
> `archetype*` are copied onto Member (psychographic, internal). They are **excluded** from the sponsor view (§3.5). All adds are nullable or defaulted → safe against existing rows. **Producer note:** purely additive columns on a shared table; confirm Producer does `SELECT`-by-column or `SELECT *` tolerant — additive columns are safe for both, but flag for a quick Producer-side check.

### 3.2 New enum `MemberEnrichmentStatus`
```sql
CREATE TYPE "MemberEnrichmentStatus" AS ENUM ('NONE','PENDING','PARTIAL','COMPLETE','STALE');
```

### 3.3 Expand `MemberEngagementEventType` ⚠️ touches existing enum
```sql
-- Each ADD VALUE is additive and idempotent-guarded. NOTE: ALTER TYPE ... ADD VALUE
-- cannot run inside a transaction with usage of the new value; run these as standalone
-- statements via `prisma db execute` (not wrapped in BEGIN/COMMIT) and do not use the
-- new value in the same migration.
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'guest_created';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'application_approved';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'application_rejected';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'comp_issued';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'access_requested';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'ticket_purchased';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'plus_one_added';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'referral_made';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'enrichment_synced';
ALTER TYPE "MemberEngagementEventType" ADD VALUE IF NOT EXISTS 'merged';
```

### 3.4 `Application` — link at submission ⚠️ touches existing model
No new column required (`memberId` already exists). Behavior change only: populate `Application.memberId` at submission. If a backfill index helps:
```sql
CREATE INDEX IF NOT EXISTS "Application_memberId_idx" ON "Application"("memberId");
```

### 3.5 Sponsor firewall view (out-of-band, additive)
```sql
CREATE OR REPLACE VIEW "sponsor_audience_member" AS
SELECT
  m."id",
  m."workspaceId",
  m."status",
  m."industry",
  m."jobFunction",
  m."seniority",
  m."companySize",
  m."companyName",
  m."companyDomain",
  m."ageRange",            -- bucketed at query time for aggregate-only use
  m."city",
  m."country",
  m."enrichmentStatus",
  m."enrichmentLastSyncedAt"
FROM "Member" m
WHERE m."mergedIntoId" IS NULL;
-- DELIBERATELY OMITTED: archetype, archetypeScores, interests, tasteSignals,
-- aiSummary, energyScore, networkValueScore, networkCapitalScore, householdIncome (raw).
```
> A view cannot be represented in `schema.prisma` (same class as `Asset_searchVector_idx`); it lives in `prisma/sql/sponsor-audience-view.sql` and is documented as a never-`db push` object.

### 3.6 (Optional, Phase 2) normalize provenance
Defer `MemberFieldProvenance` table until query needs exceed the `enrichment JSONB` blob. Not in V1.

---

## 4. Staging

### V1 — core data model + event stream + lifecycle + operator CRM record
- §3.1 Member columns, §3.2 enum, §3.3 engagement-type expansion, §3.4 application linkage, §3.5 firewall view.
- Guarantee a `Member(GUEST)` for every attendee (close personless-guest gap).
- Populate `Application.memberId` at submission; keep upsert-on-email at approval.
- Dual-write `MemberEngagementEvent` from `emitEvent`.
- Firewall: view + `sponsor-safe.ts` boundary + test; remediate archetype proximity on the sponsor page.
- Operator: upgrade `members/[id]` into the lifecycle CRM record (timeline, dimensions, provenance, referrals, merge control).
- Enrichment: provenance fields + manual/operator + self-reported capture (no external sync yet).
- **Gate:** all reads/writes workspace-scoped; firewall test green before any sponsor-facing surface ships.

### V1.5 — analytics + AI NL + public API + enrichment automation
- Audience/segment aggregate dashboard + guest→member funnel.
- **In-house enrichment engine** (NoBC-built) + scheduled refresh cron + staleness handling. Writes `ai_inferred` / `verified_enrichment` under the provenance contract. (Tenur deferred — optional later plug-in as a `verified_enrichment` source; not a V1.5 dependency.)
- Public API + Zapier (people/events/timeline/segments), API-key auth, psychographic only on internal scope.
- Vanna NL CRM queries on top of the V1 data layer + schema dictionary.
- **Gate:** provenance must be live before any enriched number reaches a sponsor export; public API must consume the firewalled view, never the raw model.

### Phase 2 — native integrations + advanced segments
- Native Mailchimp/ActiveCampaign/Beehiiv connectors (on tenant demand) over `Tag.externalSource`/`EntityTag`.
- `MemberFieldProvenance` normalization if needed.
- Auto-merge suggester from `WatchList` + `duplicateFlag`.
- Advanced/saved dynamic segments, churn (`ALUMNI`/`LAPSED` stages).

**Dependency chain:** V1 data model → everything. Firewall view → sponsor analytics + public API. Provenance fields → enrichment automation → sponsor-credible numbers. Dual-write engagement → funnel + timeline + aggregates.

---

## 5. Risks / explicit flags

- **Live firewall proximity:** `app/operator/intelligence/sponsor/page.tsx` reads `archetypeScores` today. Confirm it never flows to recap/`/doc`/`/assets`/public API; remediate in V1.
- **Producer shares Neon:** all changes additive, but get a Producer-side confirmation that additive `Member` columns are tolerated (they are for `SELECT *` and column-named reads; flagged only for completeness).
- **`ALTER TYPE ADD VALUE`** run caveat (§3.3): standalone statements, not in a txn, value unused in same migration.
- **Locked surfaces untouched:** `MembershipForm.tsx`, `/apply` screen 7 copy, `config/archetypes.ts`, AI scoring — none modified by this plan. Archetype is *copied to Member* via additive column + a separate populate step, not by altering archetype config or scoring.
- **Terminology:** "Access"/"Event Access", Member/Guest/Comp Access, "Registration fields" — honored in all new copy. No hex literals; design tokens only on the CRM UI.
```
```

---

## 6. Numbered implementation plan (for the approved build sessions — NOT executed now)

1. **Create stage** `_context/16-member-intelligence/CONTEXT.md` via the `nobc-icm` skill (canonical template, cross-refs to 02/04/07/12). Plan-tracking home.
2. **Schema additive — Member + enum** (§3.1, §3.2): edit `schema.prisma` → `prisma generate` → `prisma migrate diff --script` (review, refuse any DROP/ALTER/RENAME) → `prisma db execute` the reviewed additive SQL. Verify columns exist, GIN index intact.
3. **Engagement-type expansion** (§3.3): apply `ALTER TYPE ADD VALUE` statements individually via `prisma db execute`; regenerate client.
4. **Firewall view** (§3.5): write `prisma/sql/sponsor-audience-view.sql`, apply via `prisma db execute`; document as never-`db push`.
5. **Identity continuity (code):** populate `Application.memberId` at submission (match/upsert GUEST member on identity key); add the `Member(GUEST)`-for-every-attendee guarantee in `event-access-submit.ts` and group-buy/walk-in paths.
6. **Soft-merge (code):** `mergedIntoId` read-resolution helper + operator merge action; reads union timelines through it.
7. **Engagement dual-write:** extend `emitEvent` to also insert `MemberEngagementEvent` when `memberId` resolvable; map existing actions to the new enum vocabulary.
8. **Enrichment provenance (code):** write/read `enrichment` JSON + `enrichmentStatus`/`enrichmentLastSyncedAt`; capture self-reported (apply/registration fields) and operator-entered with source tagging. No external sync yet.
9. **Firewall boundary:** `lib/intelligence/sponsor-safe.ts` (psychographic-free type) + unit test asserting no sponsor-facing module reads psychographic columns; **remediate `sponsor/page.tsx`** archetype proximity.
10. **Operator CRM record:** upgrade `app/operator/members/[id]` (identity header + lifecycle badge, firmographic/demographic/psychographic[operator-only] panels, timeline, referrals, provenance, merge control). Design tokens only, locked terminology.
11. **Verify:** `tsc --noEmit` + `next build` green; firewall test green; workspace-scoping check on every new read/write; manual pass of guest→apply→approve continuity. Update Stage 16 CONTEXT closing checklist.
12. **(V1.5, separate milestones):** audience/funnel dashboard → Tenur integration + cron + staleness → AI inference enrichment → public API + Zapier → Vanna NL. **(Phase 2):** native connectors, provenance normalization, auto-merge, churn stages.

---

**STOP — awaiting approval.** Nothing was written this session except this spec document. On approval, confirm: (a) new Stage 16 vs folding into 07/12, (b) whether I run the `prisma db execute` steps or you do, (c) the branch (suggest `feat/member-intelligence` off `main`), and (d) sign-off to copy `archetype` onto `Member` as an additive column (no change to `config/archetypes.ts` or scoring).
