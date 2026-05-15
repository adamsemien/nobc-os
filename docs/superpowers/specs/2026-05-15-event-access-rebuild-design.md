# Event Access Rebuild — Design Spec

**Date:** 2026-05-15
**Scope:** Phase A + Phase B (this session). Phases C/D deferred.
**Status:** Approved
**Author:** Adam Semien + Claude

---

## 1. Goal

Replace the single `accessMode` selector with three independent, configurable access groups — **Member Access**, **Guest Access**, **Comp Access** — each with its own gate, optional price, and registration fields. Build a member-facing flow engine that executes the right step sequence (auth → fields → payment → fields → submit) per viewer and per group.

## 2. Canonical Terminology

This terminology is binding throughout the codebase — UI copy, variable names, comments, enums labels, emails.

| Concept | Term |
|---|---|
| The system | **Event Access** |
| The three groups | **Member Access**, **Guest Access**, **Comp Access** |
| Casual / free / one-tap | **Register** (action), **Open** (event style) |
| Curated / approval | **Apply to Attend** (action), **Apply** (event style) |
| Requires payment | **Ticketed** |
| Complimentary | **Comp** |
| Non-member paying attendee | **Guest** |
| Approved NoBC member | **Member** |
| Per-event custom questions | **Registration fields** |

### UI Copy Rules

- Never display raw enum values (`OPEN`, `TICKETED`, `apply_or_pay`, `pay_questions`, etc.).
- Primary CTAs:
  - Open event, member viewer: **"Reserve My Spot"**
  - Open event, guest viewer (free): **"Register"**
  - Ticketed event: **"Get Ticket — $X"**
  - Curated event: **"Apply to Attend"**
  - Comp confirmation page: **"You're on the list"**
- The word **"RSVP"** appears only on member-facing UI for casual Open events. Operator UI says **"Registrations"** or **"Attendees"**.

## 3. Data Model

### 3.1 New JSON Field: `Event.eventAccess`

Typed via Zod in `lib/event-access-schema.ts`:

```ts
type EventAccess = {
  member: MemberAccess
  guest:  GuestAccess
  comp:   CompAccess
}

type MemberAccess = {
  enabled: boolean
  gate: MemberGate
  priceCents: number   // 0 when gate is non-ticketed
}

type GuestAccess = {
  enabled: boolean
  gate: GuestGate
  priceCents: number
}

type CompAccess = {
  enabled: boolean
  budgetCap: number | null
}

type MemberGate =
  | "auto_confirm"            // tap once, in
  | "questions"               // fields, auto-confirm
  | "questions_approval"      // fields, operator approves
  | "pay"                     // pay, auto-confirm
  | "pay_questions"           // pay, then fields, auto-confirm
  | "questions_pay"           // fields, then pay, auto-confirm
  | "questions_pay_approval"  // fields, pay (auth), operator approves, capture — DEFERRED

type GuestGate =
  | "pay"                     // pay, auto-confirm
  | "apply"                   // fields, operator approves, no pay
  | "pay_questions"           // pay, then fields
  | "questions_pay"           // fields, then pay
  | "apply_pay"               // fields, approve, then pay — DEFERRED
  | "questions_approval"      // fields, operator approves
```

### 3.2 Legacy Field Strategy

The following Event columns are kept and **derived** from `eventAccess` on write, so legacy reads keep working until Phase C strips them:

- `accessMode` (mapped: any pay-only → `TICKETED`; any approval → `APPLY_OR_PAY`; pure free → `OPEN`)
- `applyMode` (mapped from member gate's approval bit)
- `approvalRequired` (true if any enabled gate has `_approval` suffix or `apply` value)
- `priceInCents` (`= member.priceCents` for back-compat)
- `nonMemberPriceInCents` (`= guest.priceCents`)

A `lib/event-access-derive.ts` helper enforces consistency. All new code reads `eventAccess`; only legacy components read the mirror.

### 3.3 RSVP Model

```
RSVP:
  + isComp        Boolean @default(false)
  + compType      String?    // sponsor | vendor | staff | press | partner | other
  + guestEmail    String?    // duplicated from Member for query convenience
  + guestName     String?
```

### 3.4 Member Model

Add `GUEST` to `MemberStatus`:

```
enum MemberStatus { PENDING APPROVED REJECTED WAITLISTED GUEST }
```

Filtering rule: every operator surface that shows "members" must filter `status != GUEST`. Centralize in `lib/member-filters.ts`.

### 3.5 EventCustomQuestion

```
EventCustomQuestion:
  + showToMember    Boolean @default(true)
  + showToGuest     Boolean @default(true)
  + whenInFlow      QuestionFlowStep @default(BEFORE_SUBMIT)

enum QuestionFlowStep {
  BEFORE_SUBMIT       // before any payment, before approval
  AFTER_PAYMENT       // after stripe confirms, before final confirmation
  BEFORE_APPROVAL     // operator-gated questions
}

enum FieldType {
  TEXT TEXTAREA SELECT MULTISELECT CHECKBOX DATE
  + EMAIL
  + PHONE
}
```

The builder UI (drag-to-reorder, inline editing) ships in **Phase C** — schema is ready in Phase A.

### 3.6 Migration Plan

- Add columns nullable / with defaults; `prisma generate` first, show diff, push manually (per CLAUDE.md rule).
- Backfill `eventAccess` for every existing Event from `(accessMode, applyMode, priceInCents, nonMemberPriceInCents, approvalRequired)` via one-off TS script `scripts/backfill-event-access.ts`.
- After backfill: `eventAccess` is treated as source of truth.

## 4. Architecture

### 4.1 New Files

```
lib/event-access-schema.ts   Zod schemas: EventAccessSchema, MemberGate, GuestGate
                             defaultEventAccess() factory
lib/event-access.ts          parseEventAccess(json)
                             resolveViewer(member, clerkUser) → 'member' | 'guest' | 'anon'
                             resolveAccessForViewer(event, viewer)
                               → { enabled, gate, priceCents, kind } | { closed: true, reason }
                             buildSteps(access, questions, viewerState)
                               → Step[] = [auth?, guestInfo?, fields(BEFORE_SUBMIT)?,
                                           pay?, fields(AFTER_PAYMENT)?, submit]
                             formatGateCTA(access)
                             isGateSupported(gate) → false for deferred gates
lib/event-access-derive.ts   deriveLegacyFromAccess(eventAccess) → { accessMode, applyMode,
                                                                     priceInCents, ... }
lib/member-filters.ts        whereNotGuest()
lib/format-enums.ts          + formatMemberGate, formatGuestGate, formatCompType
```

### 4.2 API Surface

**Operator endpoints (modified):**

- `POST /api/operator/events`           — accept `eventAccess`, validate, derive legacy, persist
- `PATCH /api/operator/events/[id]`     — same
- `GET /api/operator/events/[id]`       — returns both `eventAccess` and legacy mirror

**Member-facing endpoints (new):**

- `POST /api/m/events/[slug]/access/init`
  - Resolves viewer + access + steps
  - Returns `{ viewer, access, steps, eventSummary, gateSupported }`
- `POST /api/m/events/[slug]/access/payment-intent`
  - Creates Stripe PaymentIntent for `priceCents`, returns `clientSecret`
  - For deferred pay+approval gates: returns 501
- `POST /api/m/events/[slug]/access/submit`
  - Body: `{ accessKind: 'member'|'guest', guestInfo?, answers, paymentIntentId? }`
  - Server re-validates against gate definition
  - Writes RSVP (auto-confirm) or Application (approval gates), creates GUEST Member if needed, sends confirmation email
  - Returns `{ outcome: 'confirmed'|'pending_approval', rsvpId?, applicationId?, redirectTo }`

### 4.3 Wizard Step 3 (replaces current AccessModeConfig)

Three stacked toggle cards: **Member Access**, **Guest Access**, **Comp Access**.

Card behavior:
- Header row: name + description + toggle switch
- When enabled, card expands to show:
  - **Gate** — radio group, one row per option, with one-line description and icon
    - Unsupported gates (`questions_pay_approval`, `apply_pay`) render as **disabled rows** with a `"Coming soon"` chip and explanation text. Selecting them is impossible; cursor changes to `not-allowed`.
  - **Price** input (only when gate includes payment)
  - **Budget cap** (Comp card only — optional integer)
- Helper text under all cards: *"Registration fields and flow design live in event settings after saving."*

`eventAccess` is the only shape the wizard writes; legacy fields are computed server-side on submit.

### 4.4 Settings Tab — "Access" Section (Phase A scope)

A new section in `EventSettingsTab` titled **"Access"**:

- Same three toggle cards as wizard Step 3
- Save Changes triggers the same derive + persist flow
- No question builder yet (Phase C)
- No live preview iframe yet (Phase D)

### 4.5 Member-Page Flow Engine (Phase B)

#### RsvpCard rendering rules

Based on `(eventAccess, viewer)`:

| Member enabled | Guest enabled | Viewer | Result |
|---|---|---|---|
| ✓ | ✓ | member | Member CTA, "or" divider, Guest CTA below |
| ✓ | ✓ | anon/guest | Both CTAs; Member CTA labeled with "(Member)" |
| ✓ | ✗ | member | Member CTA full-width |
| ✓ | ✗ | non-member | "This event is open to members only" |
| ✗ | ✓ | any | Guest CTA full-width |
| ✗ | ✗ | any | "Access is not open at this time" |

The **"Apply to Join"** button is **removed entirely** from event pages. Membership applications are reached only via `/apply` direct link.

The minimal template's missing payment CTA is fixed by making `RsvpCard` the shared component all three templates render.

#### `<EventAccessFlow>` component

- Radix Dialog. Full-screen sheet on mobile (`max-width: 100vw, max-height: 100dvh`), centered ~520px modal on desktop.
- Progress dots row at top, one dot per step in `buildSteps()` result.
- Back button visible on every step except first; closing the dialog confirms data loss.
- Smooth fade+slide transitions between steps (`framer-motion` if already in deps, otherwise CSS transitions).

#### Step components

- `AuthStep` — Two buttons: "Sign in" (Clerk modal) and "Continue as guest". Skipped if member already signed in or if access kind is `member` and viewer is approved.
- `GuestInfoStep` — First name, Last name, Email. Validates email; submits to `/access/init` to ensure Member row exists with `status=GUEST`.
- `FieldsStep` — Renders `EventCustomQuestion` rows whose `whenInFlow === currentPhase` AND visibility matches access kind. Supports all FieldTypes.
- `PayStep` — Mounts Stripe `<PaymentElement>` with `clientSecret` from `/access/payment-intent`. Apple Pay surfaces automatically via Payment Element wallet support. On success, advance to next step (does NOT submit yet — submit step calls server with `paymentIntentId`).
- `SubmitStep` — Calls `/access/submit`, shows result screen:
  - Auto-confirm → "You're confirmed" with QR + add-to-calendar
  - Approval gate → "Your application is in review"
  - Error → inline message, allow retry

#### Stripe migration

Current code uses Stripe Checkout Session (redirect). New flow uses Payment Element (inline). For Phase B:

- Add new endpoint `/access/payment-intent` (creates PaymentIntent, returns clientSecret)
- Existing Checkout Session endpoint stays available but is no longer linked from any new UI
- Webhook handler updated to handle both `checkout.session.completed` (legacy) and `payment_intent.succeeded` (new)
- Removal of legacy Checkout flow: Phase C

#### Confirmation email

Existing Resend send is reused. New template variant for Comp confirmation ("You're on the list" — Phase C when Issue Comp UI ships). For Phase B, only the standard confirmation flows ship.

### 4.6 Deferred Gates Handling

`questions_pay_approval` (member) and `apply_pay` (guest) need Stripe authorize-then-capture-on-approval. That's Phase C work because it changes the PaymentIntent capture method, the approval action UI, and the refund-on-reject path.

For Phase A + B:
- Wizard renders them as disabled options with `"Coming soon"` chip
- If an event somehow has one set (via API or backfill edge case), the flow engine renders "This option is not available yet — please contact the host" instead of attempting payment

## 5. Phasing

### Phase A (this session, part 1)

1. Schema: `eventAccess` JSON, `isComp`/`compType`/`guestEmail`/`guestName` on RSVP, `GUEST` MemberStatus, `EMAIL`/`PHONE` FieldType, `QuestionFlowStep` enum, three new columns on `EventCustomQuestion`.
2. `prisma generate` → review diff → push.
3. New libs: `event-access-schema.ts`, `event-access.ts`, `event-access-derive.ts`, `member-filters.ts`.
4. Backfill script: convert all existing events to `eventAccess`.
5. Operator API: accept + persist `eventAccess`, derive legacy on write.
6. Wizard Step 3: rebuilt to three-card UI with disabled "Coming soon" gates.
7. Settings tab: new "Access" section.
8. Format helpers for new enums.
9. `npm run build` passes, deploy to Vercel.

### Phase B (this session, part 2)

1. `RsvpCard` rewrite (single shared component, path-aware CTAs, no "Apply to Join").
2. New `<EventAccessFlow>` Radix Dialog with step engine.
3. Step components: Auth, GuestInfo, Fields, Pay, Submit.
4. New endpoints: `/access/init`, `/access/payment-intent`, `/access/submit`.
5. Stripe Payment Element wired with Apple Pay.
6. Stripe webhook handler: handle `payment_intent.succeeded`.
7. Removal of `Apply to Join` button from minimal/editorial/split templates.
8. Fix minimal template missing payment CTA.
9. `npm run build` passes, deploy to Vercel.

### Phase C (next session)

- Registration fields builder UI in Settings (drag-to-reorder, inline edit).
- Issue Comp button + Comps section + comp confirmation email.
- Authorize/capture for deferred pay+approval gates; remove "Coming soon" chips.
- Operator approval UI uses new Application + RSVP shape.
- Remove legacy `accessMode`/`applyMode`/`priceInCents`/`nonMemberPriceInCents` fields.
- Delete legacy Checkout Session endpoint and its webhook branch.

### Phase D (next session +1)

- Settings split-pane editor with live preview iframe (`/m/events/[slug]?preview=[token]`).
- Mobile/desktop preview toggle.
- All field/section labels use `.field-label` / `.section-caps` utility classes.

## 6. Tradeoffs Accepted

- **JSON over columns** for `eventAccess` — flexibility wins; we never query by access shape.
- **GUEST as MemberStatus** — keeps relations clean; cost is one `where status != GUEST` filter everywhere.
- **Two payment paths during Phase B** — Checkout Session stays available for any in-flight payments; new flow uses PaymentIntent. Cleanup in Phase C.
- **Coming-soon gates visible** — operators see the full vision but can't shoot themselves in the foot.

## 7. Out of Scope

- Plus-ones (per-event toggle exists, untouched)
- Capacity and waitlist (existing layer, untouched)
- Wallet passes
- Red list and duplicate detection
- AI event builder
- MCP server
- WCAG audit (deferred to V1 item 20)

## 8. Open Questions

None at design lock. Implementation decisions surface during the writing-plans phase.
