# Gate Engine M1 — Recon Report

**Date:** 2026-07-10
**Branch:** `feature/gate-engine-m1-recon` @ `4119351` (worktree `~/code/nobc-os-gate`)
**Mode:** read-only recon. Zero code written beyond this file. Zero DB commands run (no `migrate diff`, no `db execute`, no psql, nothing). Nothing pushed, merged, or deployed.
**Governing spec (per Adam's GO):** `NoBadOS__spec__access-gate-engine-and-builder__2026-06-26.md` (flat, 4 verifiers) — text supplied by Adam in-session; the file itself is not in this repo's history. v3 (`_context/17-access-gate-engine/NoBadOS__spec__access-gate-engine-and-growth-platform-v3__2026-06-26.md`) treated as known-context-only.

---

## 0. Executive summary — the ground truth inverts the prompt's premise

**The gate engine is already built, and it is already in `main`.** This is the single most important finding and it reframes every task below.

- Merge commit `ecf1d071597ac8315283330968fead356878b72e` — *"Merge branch 'feat/event-builder-rebuild'"*, **2026-07-03 10:39 -0500** — is an ancestor of both `main` and this recon branch (verified with `git merge-base --is-ancestor`). It carries the full gate line: `8bfcd50` (M1 Phase A additive schema), `ab3e7c6` (M1 engine core — evaluator, registry, 5 verifiers), `bcf29b3` (M1 acceptance suite), `825430e` (M2 guest render), `fe38456` (M3 Builder), `0b946a6` (M4 bridge + `/e/` minting + rate limits), `79d483c` (M4-PAY in-page Stripe), `085162c` (commerce Order/Ticket/RSVP spine), `b7ff318` (refunds Phase C), `55080a1` (Phase F consent/capacity/PAY windows), `03b1ab7` (ways-in Phase A).
- The engine built is the **v3 nested `GateNode` tree** — with the 5th verifier `HOLD_MEMBERSHIP` and the `GrowthEdge` graph — i.e., exactly the model Adam's GO note said is *not* authorized for M1.
- Stage-17 `CONTEXT.md` (last updated 2026-07-06) and root `CLAUDE.md` still say this work is "UNMERGED by design (Adam's gate)." **Git contradicts the docs.** Either the merge was intended and the docs are stale, or the merge itself was not supposed to happen. I report; I do not resolve.
- A `backup-main-pre-crm-merge` branch exists, consistent with a deliberate integration sequence (gate merge 07-03 → CRM slices → segment UI @ `4119351`, 2026-07-10).

Consequence: "M1 recon for a build that doesn't exist yet" is not the situation on the ground. The recon below documents (a) what actually exists, (b) where admission is actually granted, (c) what purchase-proof rows exist, and (d) the requested flat Option A proposal — which now has a **name-collision problem** with the shipped tables that only Adam can resolve.

---

## 1. Task 1 — Current code as it actually is

### 1.1 The event page + access fork

**Spec claim (both specs): the access logic is a hardcoded open/paid/apply fork in `EventAccessFlow.tsx`. — WRONG (outdated).**

What I read: `app/m/events/[slug]/_components/EventAccessFlow.tsx` (1–1131, full file), `lib/event-access.ts` (1–240, full file), `lib/event-access-schema.ts`, `app/e/[slug]/_components/DoorFork.tsx` (1–56).

There are **two coexisting access systems**:

**System 1 — legacy `eventAccess` jsonb flow (live on `/m/events/[slug]` and the public `/e/[slug]` buy path):**
- `Event.eventAccess Json` (`prisma/schema.prisma:753`) with default `{"member":{"enabled":true,"gate":"auto_confirm","priceCents":0},"guest":{"enabled":false,"gate":"pay","priceCents":0},"comp":{...}}`.
- `lib/event-access.ts` parses it through **two stacked legacy-migration layers** (`migrateLegacyAccess`, lines 78–129: old gate-enum format → old FlowStep[] format → current small-g `Gate[]` chip format from `lib/event-gates.ts`: `application` / `ticket` / `waitlist`), then `resolveAccessForViewer` (151–174) → `deriveFlow` (22–39) → `buildSteps` (187–217).
- `EventAccessFlow.tsx` is **not** a hardcoded three-way fork: `buildScreens` (76–109) walks `event.steps` (auth / guestInfo / fields / tierSelect / pay / submit) computed server-side. Pay is terminal (105–107). It is data-driven off the resolved access, with the fork living in the *data*, not the component.
- The public page's `DoorFork.tsx` renders the two-choice entry (Become a member → `/apply`; Get your ticket → reveals the legacy access card). It deliberately does not touch the gate engine.

**System 2 — the capital-G gate engine (v3 nested tree), merged 2026-07-03:**
- `lib/gate-engine/` — `types.ts`, `registry.ts`, `validate.ts`, `evaluate.ts`, `orchestrate.ts` (`createGateEngine`, mints `GateSession` at orchestrate.ts:156), `proofs.ts`, `growth.ts`, `guest-session.ts`, `guest-view.ts`, `authoring.ts`, `application-bridge.ts`.
- Seven registered condition types in `lib/gate-engine/conditions/`: `pay`, `answer-questions`, `referred-by-member`, `attended-prior`, `hold-membership`, `collect-info`, `open`.
- Guest surfaces: `POST app/e/[slug]/access/route.ts` mints a `GateSession` (rate-limited 10/min/IP, GET mints nothing) → 303 to `/gate/[token]` (`app/gate/[token]/page.tsx` + `_components/`), driven by `app/api/gate/[token]/route.ts` (identify / submit / check_application) and `app/api/gate/[token]/payment-intent/route.ts`.
- Operator surfaces: `app/api/operator/events/[id]/gate/route.ts` (+ `/gate/sessions`) — the M3 Builder authoring API.
- On top: `lib/ways-in/` (Phase A) — `EventAccessModel` table (schema:2367) holds the authored Ways-In list as source of truth; the gate tree is a compile artifact (`compile.ts`, `save.ts`, id-stable recompiles via `compiledMap`).

### 1.2 Stripe payment flow end-to-end (legacy path)

What I read: `app/api/e/[slug]/access/payment-intent/route.ts` (grep-verified lines 12, 38, 97–201, 234–272), `app/api/webhooks/nobc/stripe/route.ts` (lines 73–83, 100–306, 335–453), `app/api/webhooks/stripe/route.ts` (full — 2 lines), `EventAccessFlow.tsx` 155–221, 782–889.

1. Client reaches pay screen → POST `/api/e/[slug]/access/payment-intent` (anon) or `/api/m/events/[slug]/access/payment-intent` (signed-in). **Price is resolved server-side**: `tierId` → `TicketTier.memberPriceCents`/`nonMemberPriceCents` (route:100–108), else `priceForResolved(resolved)` from `eventAccess` (110); buyer-fee gross-up via `grossUpForBuyer` (120); `capture_method: 'manual'` when approval-required (12). PI metadata stamps `workspaceId, eventId, memberId, slug, feeCents` (187). Idempotency key includes amount + capture mode (168–177). An RSVP row is created/held with `amountCents`, `tierId` (199–235).
2. Client confirms via Stripe.js (`PayStep`/`PayForm`, EventAccessFlow:782–889). The client `onSuccess` only sets **UI** state.
3. Server truth lands via webhook `app/api/webhooks/nobc/stripe/route.ts`: signature-verified with `constructEvent` + `STRIPE_WEBHOOK_SECRET` (73–83); `payment_intent.amount_capturable_updated` → `ticketStatus:'confirmed', status:'CONFIRMED', paymentStatus:'AUTHORIZED'` (182–188); `payment_intent.succeeded` → `confirmed/CAPTURED/capturedAt` (249–255); failure/cancel → `payment_failed/DECLINED/FAILED` (300–306); `charge.refunded` → `refunded` (356–366); disputes handled (438+). `/api/webhooks/stripe/route.ts` is a re-export of the same handler.
4. `app/api/cron/capture-payments/route.ts` captures authorized holds.

**Gate path Stripe flow:** `/api/gate/[token]/payment-intent` mints from the PAY node's `config.priceCents` (server-side; D6 discount stamps are server-computed into intent metadata); the PAY verifier (`lib/gate-engine/conditions/pay.ts:195–253`) re-reads the intent from Stripe, enforces `status === 'succeeded'`, currency, `amount_received >= required`, and **member ownership** (metadata.memberId match or an internal RSVP/Ticket row — `defaultOwnsIntent`, pay.ts:101–125); then `bridgeGateAdmission` (`lib/commerce/gate-bridge.ts:274–368`) records Order + Ticket + confirmed RSVP idempotently on the payment-intent id (`recordForPayNode` → `recordPaidAdmission`, gate-bridge.ts:46–164), with capacity-race and promo-race **auto-refund + proof expiry** (121–160, 170–201).

### 1.3 RSVP / apply flow and how `eventAccess` + `TicketTier` are read/written

- Free/approval submits: `app/api/m/events/[slug]/access/submit/route.ts:237` and `app/api/e/[slug]/access/submit/route.ts:172` both funnel into `lib/rsvp-submit.ts`: `approvalRequired` → `pending_approval`/`WAITLISTED` server-side (125–126); atomic capacity gate with row lock + waitlist entry (131–170).
- `eventAccess` written by the operator event routes (`app/api/operator/events/route.ts`, `[id]/route.ts`); `TicketTier` via `app/api/operator/ticket-tiers/`.
- Apply-flow: membership application approval (`lib/applications/approve.ts:101–127`) confirms the application-issued comp RSVP for the active event ("Door 1"), fail-closed logging.

### 1.4 Spec-claim verification

| Claim | Verdict |
|---|---|
| Hardcoded open/paid/apply fork in `EventAccessFlow.tsx` | **Wrong** — data-driven steps; fork lives in resolved `eventAccess` data. Component itself is a frozen zone under the theme bridge. |
| Price in two places (`eventAccess.guest.priceCents` + `TicketTier`) | **Understated — price lives in at least four shapes:** `eventAccess.member/guest.priceCents` (schema:753), `Event.priceInCents`/`nonMemberPriceInCents` (745–746, legacy columns), `TicketTier.memberPriceCents`/`nonMemberPriceCents` (1492–1493), and PAY-node `config.priceCents` (pay.ts:29). The flat spec's "migrate into PAY config then freeze" has *started* (gate path) but not consolidated. |
| "Apply" is stapled onto the RSVP/ticket fork | **Was true of the legacy shape** (an `approval` FlowStep + `pending_approval` ticketStatus stapled onto RSVP) — but the gate engine's `ANSWER_QUESTIONS`/application-bridge now models it first-class on the gate path. |
| `eventAccess` is jsonb | **Correct** (`Json` column, schema:753) — with two legacy formats still parsed at runtime. |

### 1.5 Which data model does live code lean toward? (report only)

**Nested.** Not a lean — a shipped fact: `Gate`/`GateNode` (kind CONDITION|GROUP, rule ALL|ANY_N|WEIGHTED, `parentId` tree, depth ceiling enforced by the authoring validator) is in `prisma/schema.prisma:2385–2443` at HEAD of `main`, with the evaluator, builder, guest walkthrough, ways-in compiler and commerce bridge all written against it. Notably, `lib/ways-in/compile.ts` compiles the authored list to a **root GROUP(ANY_N,1) of GROUP(ALL) children** — i.e., the day-to-day authored shape is effectively flat-composed-of-ALL-groups, one nesting level, exactly the depth the flat spec's semantics need. Per instruction, I flag and do not resolve: see Open Question #1.

---

## 2. Task 2 — Access-grant chokepoints

Every point found where the system decides "this person is admitted" and writes the confirmed row. Enumerated via `grep -rn 'rsvp.(create|update|upsert)' + "ticketStatus: 'confirmed'"` across `app/` + `lib/` and then read.

### Legacy path

| # | Chokepoint | Where the confirmed row is written | Enforcement |
|---|---|---|---|
| 1 | Free/open submit | `lib/rsvp-submit.ts:125–170` via `app/api/m/events/[slug]/access/submit/route.ts:237`, `app/api/e/[slug]/access/submit/route.ts:172` | **Server-side.** `pending_approval` vs `confirmed` derived from the Event row, not the request; atomic capacity gate (row lock) prevents oversell; red-list short-circuit returns a decoy `confirmed` without a row (rsvp-submit.ts:72, deliberate). |
| 2 | Paid (webhook) | `app/api/webhooks/nobc/stripe/route.ts:127–129, 182–188, 249–255` | **Server-side.** Stripe-signature-verified (73–83). Client `onSuccess` is UI-only. `/api/webhooks/stripe` = re-export. |
| 3 | Paid (PI mint w/ comp/zero bypass) | `app/api/m/events/[slug]/access/payment-intent/route.ts:122, 139, 162` | **Server-side** (operator bypass / comp paths — confirms without Stripe). |
| 4 | Auth/capture cron | `app/api/cron/capture-payments/route.ts:18` | Server cron. |
| 5 | Operator RSVP approve | `app/api/operator/rsvps/[id]/approve/route.ts:50` | `requireRole(STAFF)` (line 10). |
| 6 | Operator comp | `app/api/operator/events/[id]/comp/route.ts:81` | `requireRole(STAFF)` (line 24). |
| 7 | Operator promote-waitlist | `app/api/operator/events/[id]/promote-waitlist/route.ts:53` | `requireRole(STAFF)` (line 11). |
| 8 | Operator event route write | `app/api/operator/events/[id]/route.ts:248` | Under the audited `requireRole` blanket for `/api/operator/*` writes. |
| 9 | Agent tools | `lib/agent/tools/rsvps/{approve.ts:60, comp-ticket.ts:77, promote.ts:53}` | Behind `/api/agent/*` STAFF gate. |
| 10 | MCP legacy tools | `lib/mcp/legacy-tools.ts:144–179` | Clerk-session callers role-gated (default-deny STAFF, PR #51); **external Bearer write path still awaiting its own auth design** (known open item). |
| 11 | Membership-apply approval → Door 1 comp confirm | `lib/applications/approve.ts:117` | Behind the STAFF-gated applications approve route; fail-closed. |
| 12 | Plus-one | `app/api/rsvp/plus-one/route.ts:58, 95` | **Not fully verified this session** — guard not read; flagging rather than asserting. |
| 13 | Walk-in at the door | `app/api/check-in/walkin/route.ts:74, 86` | Event-scoped signed check-in token (`verifyCheckInToken`, lines 23–25); event+workspace come from token scope, not the body (line 36). |
| 14 | Waitlist auto-promote | `lib/waitlist.ts` (cancel → promote path) | Server-side library, invoked from gated routes. |

### Gate-engine path

| # | Chokepoint | Where | Enforcement |
|---|---|---|---|
| 15 | Session mint | `app/e/[slug]/access/route.ts` POST | Public by design; rate-limited 10/min/IP; GET mints nothing (M4-D7). |
| 16 | Condition verify | `app/api/gate/[token]/route.ts` POST → registry verifiers | Token is the credential (anonymous door); every verifier runs **server-side**; PAY has replay defense (intent ownership: metadata.memberId or internal RSVP/Ticket row — pay.ts:224–234), amount/currency checks, node-bound discount stamps (readDiscountStamp, pay.ts:146–175). Fail-closed: PENDING_REVIEW/REJECTED/expired all evaluate unsatisfied (`isProofLive`, proofs.ts:39–48). |
| 17 | Admission record | `bridgeGateAdmission` (`lib/commerce/gate-bridge.ts:274`) called after **every** evaluated POST (`app/api/gate/[token]/route.ts:98`) → `recordPaidAdmission` / `ensureOpenAdmission` (`lib/commerce/orders.ts`) | Server-side, idempotent on payment-intent id; open sweep self-heals charge-recorded gaps; capacity/promo race → **auto-refund + proof expiry** so a stale open decision cannot seat a refunded charge (gate-bridge.ts:116–160, 323). |

**Bottom line:** no client-bypassable admission write was found. All confirmed-row writes are server-side; client-side "success" states are presentational. The two soft spots are #10's external-Bearer MCP path (already a known open item) and #12 (unverified guard on plus-one).

---

## 3. Task 3 — Purchase-proof data

**Is there a queryable "this Person bought this ticket for this Event" row today? Yes — four layers, all Member-keyed:**

1. **`Order`** (schema:1553–1590): `workspaceId`, `eventId?`/`seriesId?` (XOR), `buyerMemberId?`, `buyerName`, `buyerEmail`, `subtotalCents/serviceFeeCents/promoDiscountCents/totalCents`, `stripePaymentIntentId @unique`, `paymentStatus`. Resolves to Member (nullable FK) and always to an email.
2. **`Ticket`** (schema:944–966): `workspaceId`, `eventId`, **`memberId` (required)**, `rsvpId` (required), `stripePaymentIntentId?`, `amount`, `status AUTHORIZED|CAPTURED|REFUNDED|CANCELLED`; `Payment` child rows (978–995).
3. **`RSVP`** (schema:873–935): **`memberId` required**, `personId` **nullable** ("Person spine (Phase 2A): seam only"), `stripePaymentIntentId?`, `paymentStatus?`, `amountCents?`, `guestEmail/guestName`, `orderId?`, `tierId?`. `@@unique([workspaceId, eventId, memberId])`.
4. **`GateProof`** (schema:2451–2473): `conditionType:'PAY'`, `mechanism:'STRIPE_PAYMENT'`, payload `{paymentIntentId, amountReceived, currency, promo…}`, **`memberId` required**, `expiresAt?`.

**Can the M1 PAY verifier's Proof read an existing purchase-proof row, or must it establish one from scratch?** It already does both, today: `defaultOwnsIntent` (pay.ts:101–125) reads existing `RSVP.stripePaymentIntentId` / `Ticket.stripePaymentIntentId` rows to prove intent ownership, and `recordPaidAdmission` writes the Order+Ticket+RSVP set from a satisfied proof. Two real gaps:

- **Person-keying gap:** every proof/purchase row resolves a **Member**, never a bare Person. `RSVP.personId` exists but is a nullable seam; `GateProof` has no `personId` at all. A guest who buys is force-materialized as a Member row (the gate identify step resolves/creates one). This fails the recon prompt's Person-primary bar — see Open Question #4.
- **Legacy-history gap:** pre-gate paid RSVPs/Tickets are not back-converted into `GateProof` rows. Immaterial for PAY (carry-forward NEVER, per-event by locked decision), and `ATTENDED_PRIOR` sidesteps it by reading check-in history directly (`countCheckIns` on internal records, attended-prior.ts:22–53) rather than proofs.

---

## 4. Task 4 — Proposed M1 additive schema (Option A — flat; PROPOSAL ONLY)

> Per Adam's GO: one proposal, flat. **Nothing here was created, migrated, or executed.** No prisma command of any kind was run this session.

### 4.0 The collision problem (must be decided before any DDL is drafted for real)

The flat spec's table names — `Gate`, `GateProof`, `GateSession` — **already exist in `prisma/schema.prisma` on `main`** with v3 shapes (2385, 2451, 2502). A flat M1 build therefore cannot be purely additive under those names: it would require DROP/ALTER of shipped tables (banned without coordination) or new names. The proposal below uses the spec's semantics with the only-safe assumption: **new, non-colliding names**, prefixed `Flat` purely as a placeholder for Adam to rename or reject.

Also load-bearing: **the shipped schema already implements the flat spec's semantics as a degenerate case.** A flat gate ≡ one root `GateNode` GROUP with rule ALL|ANY_N|WEIGHTED and only CONDITION children; `required`/`weight` live on the child (GateNode:2432–2433); per-condition validity windows already exist via `GateProof.expiresAt` + the registry's `carryForward` policies — verified in code: `answer-questions.ts:77` `{MONTHS, 12}`, `attended-prior.ts:51` `{ALWAYS}`, `pay.ts:194` `{NEVER}`, `hold-membership.ts:30` `{LIVE}`, `referred-by-member.ts:47` `{ALWAYS}` — matching locked decision #4 exactly (FOLLOW_INSTAGRAM live/0 is unimplemented, v2.1). So Option A buys no capability the shipped tables lack; it buys *shape simplicity* at the cost of a parallel/replacement build.

### 4.1 Option A — flat tables (spec §5.1, refined against the live schema)

```prisma
model FlatGate {
  id               String        @id @default(cuid())
  workspaceId      String
  workspace        Workspace     @relation(fields: [workspaceId], references: [id])
  eventId          String        @unique            // one gate per event (v2)
  event            Event         @relation(fields: [eventId], references: [id])
  satisfactionRule FlatGateRule  @default(ALL)      // ALL | ANY_N | WEIGHTED
  ruleThreshold    Int?                             // N for ANY_N, threshold for WEIGHTED
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  conditions       FlatGateCondition[]
  sessions         FlatGateSession[]
  @@index([workspaceId])
}

enum FlatGateRule { ALL ANY_N WEIGHTED }

model FlatGateCondition {
  id              String    @id @default(cuid())
  workspaceId     String
  gateId          String
  gate            FlatGate  @relation(fields: [gateId], references: [id], onDelete: Cascade)
  type            String                            // registry key, NOT a PG enum (additive types, no DDL)
  config          Json
  required        Boolean   @default(false)
  weight          Float?
  order           Int       @default(0)
  dependsOnId     String?                           // optional ordering dependency
  /// Per-condition carry-forward validity window, days. NULL = never expires
  /// (ATTENDED_PRIOR); 0 = live-only/no carry (FOLLOW_INSTAGRAM live, PAY per-event);
  /// 365 = ANSWER_QUESTIONS default. Registry supplies defaults; this column overrides.
  validityDays    Int?
  proofs          FlatGateProof[]
  @@index([gateId])
  @@index([workspaceId])
}

model FlatGateProof {
  id               String    @id @default(cuid())
  workspaceId      String
  conditionId      String
  condition        FlatGateCondition @relation(fields: [conditionId], references: [id], onDelete: Cascade)
  // Person-primary dual pointer — see 4.2. Exactly one of the two set.
  personId         String?
  memberId         String?
  eventId          String                            // denormalized for carry-forward lookup
  conditionType    String                            // denormalized for cross-gate carry queries
  satisfied        Boolean
  score            Float?
  evidence         Json?
  verifierResult   Json?
  needsHuman       Boolean   @default(false)
  resolvedByUserId String?
  verifiedAt       DateTime  @default(now())
  expiresAt        DateTime?                         // materialized from validityDays at write time
  createdAt        DateTime  @default(now())
  // NOTE: no @@unique here — see 4.2 (partial unique indexes out-of-band)
  @@index([workspaceId, personId, conditionType])
  @@index([workspaceId, memberId, conditionType])
}

model FlatGateSession {
  id          String   @id @default(cuid())
  workspaceId String
  gateId      String
  gate        FlatGate @relation(fields: [gateId], references: [id], onDelete: Cascade)
  personId    String?
  memberId    String?
  guestEmail  String?
  state       FlatGateSessionState @default(OPEN_PROGRESS)
  openedAt    DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([gateId, memberId])
  @@index([workspaceId])
}

enum FlatGateSessionState { OPEN_PROGRESS PENDING_REVIEW OPENED BLOCKED }
```

### 4.2 Person-primary check (REFERRED_BY_MEMBER, ATTENDED_PRIOR)

The spec's `GateProof.memberId (FK)` fails Person-primary — and so does the shipped v3 `GateProof` (memberId required, no personId). Option A therefore carries the **dual pointer** (`personId?`, `memberId?`), which forces the same trade the CRM spine already made on `ChannelSubscription` and `SegmentSnapshotMember`: Prisma's `@@unique` cannot express `WHERE` clauses, so the "one live proof per condition per person/member" guarantee must live in **two out-of-band partial unique indexes**:

```sql
CREATE UNIQUE INDEX "FlatGateProof_condition_person_key"
  ON "FlatGateProof"("conditionId", "personId") WHERE "personId" IS NOT NULL;
CREATE UNIQUE INDEX "FlatGateProof_condition_member_key"
  ON "FlatGateProof"("conditionId", "memberId") WHERE "memberId" IS NOT NULL;
```

⚠️ This deliberately extends the existing `db push` landmine class: like `Asset_searchVector_idx`, `ChannelSubscription_person_channel_stream_key`, and the two `SegmentSnapshotMember` partials, these two indexes would live only in the database and be dropped as "drift" by any `db push`. They must be added to the CLAUDE.md landmine list if adopted. Verifier lookups: `REFERRED_BY_MEMBER` needs the *referrer* resolved as an approved Member (correct — referrers are members) but the *referee* keyed as bare Person; `ATTENDED_PRIOR` needs check-in history keyed by Person (today `RSVP.personId` is nullable and sparsely backfilled — an honest ATTENDED_PRIOR-by-Person needs that seam wired, which is CRM-slice work, not gate work).

### 4.3 Additive-safety statement

As drafted: **CREATE TABLE / CREATE TYPE / CREATE INDEX only.** No ALTER, no DROP, no RENAME, no column-type change, no touch on `Asset_searchVector_idx`, `ChannelSubscription_person_channel_stream_key`, `SegmentSnapshotMember_segment_person_key`, or `SegmentSnapshotMember_segment_member_key`. It adds two new partial unique indexes of the same out-of-band class (flagged above). It is additive **only** under non-colliding names; under the spec's original names it is not implementable without destructive DDL against shipped tables.

### 4.4 One-line v3 note (per GO)

Under v3 nothing in 4.1 would be drafted at all — the shipped `Gate`/`GateNode`/`GateProof`/`GateSession` already cover it; the only genuinely new work Option A introduces is the Person-primary dual pointer, which could equally be retrofit onto v3's `GateProof` as one additive nullable `personId` column + the two partial indexes.

---

## 5. Assumptions either spec got wrong (vs. live code)

1. **Both specs**: "current code is a hardcoded fork in `EventAccessFlow.tsx`" — outdated; it's data-driven off resolved `eventAccess`, and a whole second engine now exists beside it.
2. **Flat spec §5.1** "Price is a PAY condition's config.priceCents — single source of truth; eventAccess.guest.priceCents and TicketTier migrate into it then freeze" — directionally begun on the gate path, but live price still exists in four shapes (eventAccess, Event.priceInCents columns, TicketTier, PAY config). No freeze has happened.
3. **Flat spec §2.2** "4 verifiers, v2" — live registry has seven condition types (the five v3 verifiers + `collect-info` + `open`).
4. **Flat spec §5.1 GateProof `UNIQUE(conditionId, memberId)`** — the shipped analogue is `@@unique([nodeId, memberId])` with `nodeId` nullable (`SetNull` on node delete so history survives edits) — implemented as find-then-write because of the nullable column (proofs.ts:64–93). Any flat build hits the same nullable-unique subtlety.
5. **v3 spec / CONTEXT.md**: "UNMERGED by design" — contradicted by merge `ecf1d07` on `main` (2026-07-03).
6. **Both specs' carry-forward as a query**: shipped implementation is **copy-on-landing** (mint a node-anchored proof from the newest live same-type proof, preserving the ORIGINAL `expiresAt`, `sourceProofId` lineage, never overwriting local history — proofs.ts:100–156), not a pure lookup.

---

## 6. Open questions for Adam

1. **⚡ FRONT AND CENTER — flat vs nested is no longer a paper question.** The v3 nested engine is built, tested, and merged into `main` (M1→M4-PAY + ways-in + commerce + refunds, merge `ecf1d07`, 2026-07-03). The flat spec you've locked for "THIS build" describes tables that collide by name with shipped ones and semantics the shipped engine already covers as a one-level tree (ways-in even compiles to exactly that shape). What does "M1 build" now mean: (a) a parallel flat build under new names, (b) demolition/replacement of the v3 tables (non-additive, Producer-coordination territory), or (c) re-scoping M1 against what's shipped? I have not resolved this — it is yours.
2. **Was the 2026-07-03 merge of `feat/event-builder-rebuild` into `main` intended?** CONTEXT.md (updated 2026-07-06, *after* the merge) and CLAUDE.md still say "unmerged by design." `backup-main-pre-crm-merge` exists. Docs or git — one of them is wrong.
3. **Production DB state is unverified (deliberately — zero DB access this session).** `prisma/sql/gate-engine-m1.sql`, `ways-in-phase-a.sql`, `event-builder-phase-a/f.sql`, `stripe-event.sql` exist as artifacts; CONTEXT.md says ways-in SQL is NOT applied and acceptance ran on the `ep-sweet-term` Neon branch. If `main` auto-deploys to Vercel, merged code referencing unapplied tables = runtime failures on every gate surface in prod. Which of these has actually been run against production Neon?
4. **Person-primary**: the entire proof/growth/purchase layer is Member-keyed (`GateProof.memberId` required, no `personId`; `Ticket.memberId` required; `RSVP.personId` a nullable seam). Both REFERRED_BY_MEMBER and ATTENDED_PRIOR resolve Members, not bare Persons. Retrofit one additive `GateProof.personId` + partial indexes (per §4.2/§4.4), or accept Member-keying for M1?
5. **The flat spec file** is not in this repo's history anywhere (`git log --all --diff-filter=A` across every branch). Should the authoritative text you pasted be committed to `_context/17-access-gate-engine/` so the two specs live side by side on the record?
6. **Plus-one route guard** (`app/api/rsvp/plus-one/route.ts`) was the one admission chokepoint whose auth I did not read this session — worth a 5-minute check on whatever session follows.

---

## 7. Session compliance

- Only file created: this one. No other file in either worktree was modified.
- Zero DB commands: no `migrate diff` (unneeded — no schema edit was made), no `migrate dev/deploy`, no `db execute`, no `db push`, no psql, no connection opened.
- No `git push`, no merge, no PR, no deploy. One local commit on `feature/gate-engine-m1-recon` containing only this file.
- Frozen zones: `EventAccessFlow.tsx` and `lib/event-access.ts` were **read** (required by Task 1); nothing in any frozen zone was edited. MembershipForm internals, `config/archetypes.ts`, scoring/reveal, merge engine, sponsor firewall: untouched and unread.
- The CLAUDE.md "mandatory closing checklist" (update stage CONTEXT.md) was **deliberately not performed**: this session's only-file rule overrides it. Noting the conflict here instead — CONTEXT.md's Status block is stale on the merge fact regardless (see Open Question #2).
