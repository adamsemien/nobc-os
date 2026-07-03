# Event Builder Rebuild (v3 cutover) - Phase Plan

> **Status: AWAITING ADAM'S APPROVAL. No build work starts until this plan is approved.**
>
> Branch `feat/event-builder-rebuild`, cut from `feat/gate-engine-m4-pay` (79d483c), in its own
> worktree (`.claude/worktrees/event-builder-rebuild`). DB: ep-sweet-term only. Nothing merges,
> pushes to main, or deploys without Adam's explicit sign-off. GATE_PAY_LIVE_CHARGES stays unset.

## Ground-truth corrections found while planning

These override the directive's sketch where they differ; everything else in the directive checked out.

1. **`ACTIVE_EVENT_ID` has five import sites, not six** (grep on this tree):
   `app/api/apply/membership/[id]/submit/route.ts:10`, `app/api/operator/applications/[id]/reject/route.ts:7`,
   `app/m/events/[slug]/_components/TemplateSplit.tsx:10`, `lib/agent/tools/applications/reject.ts:5`,
   `lib/applications/approve.ts:8`. `DoorFork.tsx` is reached only through TemplateSplit's
   `isActiveEvent` branch (TemplateSplit.tsx:46-47). Phase D reconciles all five plus DoorFork.
2. **The gate flow writes no attendance or money records today.** M4-PAY writes GateProof +
   GateSession only; the door list (`app/api/check-in/event/route.ts:25`) reads exclusively
   `RSVP.ticketStatus in ['confirmed','held']`. Phase A must build the Open -> RSVP + Order + Ticket
   bridge or gate buyers never reach the door list.
3. **`RefundPolicy` and `WaitlistPromotion` are enums, not tables** (schema.prisma:504, :510).
   "Leave dormant unless needed" applies to the TicketHold and AccessToken tables; both stay dormant
   in this plan. PromoCode + Order + Ticket are the adopted trio.
4. **The Operating Doc file is not in the repo** (checked `_context/` on this branch and main).
   Planning is against the directive's quoted 4.1 constraints, which are treated as authoritative.
5. **The current "new event" page is literally a four-step wizard** (`app/operator/events/new/page.tsx`:
   Draft -> Details -> Access -> Template) - the exact locked anti-pattern. Phase B replaces it
   wholesale, not incrementally.
6. **The live ADMIN refund machine** is `app/api/stripe/refund/route.ts` (partial refunds, cumulative
   idempotency key `refund-${rsvp.id}-${cumulativeTarget}`, cancel path `cancel-${rsvp.id}`). The
   orphan to retire is `app/api/operator/rsvps/[id]/refund/route.ts` (simpler machine, dead UI).

## Standing calls made under directive authority (flagged, not stalls)

- **C1 - Tiers fold into PAY composition** (directive invited the call). "Multiple prices" in the new
  builder = multiple PAY nodes under an ANY_1 group (PAY-D4). TierManager and its NaN bug are retired
  from the new surface, not repaired; `TicketTier` stays read-only for pre-cutover events.
- **C2 - Questions' one home is the gate's ANSWER_QUESTIONS node.** The new builder edits exactly one
  question store: the ANSWER_QUESTIONS node config. A collect-only mode (`review: 'collect'`) is added
  to that condition so plain registration fields need no scoring call. This edits a registry plugin
  (`lib/gate-engine/conditions/answer-questions.ts`), NOT the frozen evaluator - same class of change
  as the M4-PAY Option-A plan treated as permissible. If build reveals the evaluator itself must
  change, that thread stops and goes in the report per the freeze rule.
- **C3 - COMP_CODE becomes a new `ProofMechanism` enum value** (additive SQL). An honest comp proof is
  stamped mechanism COMP_CODE, tier FIRST_PARTY, payload carrying the promo code id.
- **C4 - The preview is a signed-token route** (HMAC, event-scoped, short expiry - the
  `lib/check-in-token.ts` pattern) that ALSO accepts an operator session, satisfying "token-gated or
  operator-gated" with one route.
- **C5 - Phase order runs 0, A, B, C, D, E.** E needs B's action layer; C needs A's commerce lib;
  D snapshots everything.

---

## Phase 0 - Baseline harness (Proof) - prerequisite for acceptance 8 and 9

| File | Change |
|---|---|
| `tests/unit/nbs-render-baseline.test.ts` | NEW - pins current behavior for an NBS-shaped event (eventAccess with `guest.gates[0].priceCents = 2500`, blanked workflow paths, id = ACTIVE_EVENT_ID): parseEventAccess output, deriveFlow, TemplateSplit branch decisions (isActiveEvent/showFork), CTA copy, public DTO shape. Fixture-based, zero prod contact. Must pass before AND after all phases. |
| `scripts/seed-event-builder.ts` | NEW - deterministic ep-sweet-term seed: one NBS-replica event (legacy shape), one blank workspace for new-builder acceptance runs. |

Also recorded here: full-suite baseline count (the 5 known pre-existing failures) so acceptance 9 has
a denominator.

## Phase A - Commerce spine (Spine)

Goal: successful PAY writes Order + Ticket + confirmed RSVP; PromoCode redemption incl. 100%-off comp
that never touches Stripe; service fee computed into PAY amounts with transparent line items.

| File | Change |
|---|---|
| `lib/commerce/service-fee.ts` | NEW - pure math for all four `ServiceFeeMode` values (schema:497): absorb (charge = price), pass_stripe_only (exact-integer gross-up `(price + 30) / (1 - 0.029)`), pass_stripe_plus_markup (gross-up + `serviceFeePercentBps`), flat_per_ticket (`+ serviceFeeFlatCents`). Returns `{ baseCents, feeCents, discountCents, totalCents }` line items. Default absorb. |
| `lib/commerce/promo-codes.ts` | NEW - validate + redeem `PromoCode` (schema:1265): scope XOR, validity window, maxUses / maxUsesPerCustomer, discount application, comp detection (`discountType: 'comp'` or 100 percent). Workspace-scoped everywhere. |
| `lib/commerce/orders.ts` | NEW - `recordPaidAdmission()` in one transaction: Order row (subtotal/serviceFee/promoDiscount/total, intent id, paymentStatus), Ticket row, RSVP upsert (`ticketStatus: 'confirmed'`, linked to the Order) so the door list works unchanged. Also `recordCompAdmission()` for the no-Stripe path. |
| `app/api/gate/[token]/payment-intent/route.ts` | MODIFY - amount becomes fee-adjusted total from service-fee.ts; optional `promoCode` in body; response gains line items; metadata gains `feeCents`, `promoCodeId`; 100%-off short-circuits to `{ comp: true }` with zero Stripe contact. GATE_PAY_LIVE_CHARGES rail and idempotency key semantics preserved (key now carries the charged total). |
| `app/api/gate/[token]/route.ts` | MODIFY - submit action: PAY proof SATISFIED -> `recordPaidAdmission()`; comp submission -> COMP_CODE proof via the engine's public proof surface (`lib/gate-engine/proofs.ts` ProofWrite) + `recordCompAdmission()`; gate Open for EVENT resource guarantees the confirmed RSVP exists. |
| `prisma/schema.prisma` | MODIFY (additive only) - `ProofMechanism` gains `COMP_CODE`; `Order` gains nullable `gateSessionId`; verify whether a promo-redemption table already exists (Order.redemptions relation) before adding anything. Exact SQL via `migrate diff`, applied to ep-sweet-term via `db execute`, SQL file delivered to Adam. NO db push. |
| `tests/unit/commerce/service-fee.test.ts` | NEW - all four modes, exact cents at $25.00 / $17.00 / $10.50 / $99.99, net-within-a-cent for pass-through modes. |
| `tests/unit/commerce/promo-codes.test.ts` + `orders.db.test.ts` | NEW - redemption rules; transaction writes; door-list visibility of the written RSVP. |
| `tests/unit/gate-engine/pay-flow.db.test.ts` | EXTEND - Order + Ticket assertions on the existing PAY acceptance; comp flow end to end. |

## Phase B - Builder surface (Prism)

Goal: one live record, side-by-side WYSIWYG anon preview on the true `/e/` code path, actions-first,
one question editor, gate-replaces-door notice, fee toggle, comp code UI. Design bar per Decision 7.

| File | Change |
|---|---|
| `lib/builder/actions.ts` | NEW ('use server') - THE typed action layer (Decision 6): createEventDraft, updateEventDetails, setTemplate, composeGate/updateGateTree (wrapping `lib/gate-engine/authoring.ts` public API), addPayNode/updatePayNode, setServiceFee, setQuestions, createCompCode/deactivateCompCode, publishEvent/unpublishEvent. Every action requireRole(STAFF)-guarded, workspace-scoped, writes ONLY v3 shape - zero writes to accessMode/priceInCents/eventAccess/EventWorkflow.paths (acceptance 3 is a test on this file). UI and AI both call these; publish requires an explicit operator flag the AI path never sets. |
| `lib/preview-token.ts` | NEW - mint/verify HMAC event-scoped preview tokens (check-in-token pattern, short expiry). |
| `lib/public-event-loader.ts` | MODIFY - split resolution from assembly: `assemblePublicEventDTO` keeps the PUBLISHED slug resolution; new `assembleEventDTOById(workspaceId, eventId)` shares 100 percent of the assembly and is used by both the live page and the preview route (acceptance 2: same code path by construction). |
| `app/e/preview/[token]/page.tsx` | NEW - renders `PublicEventShell` + `EventDetail` (viewer 'anon') for a DRAFT via preview token or operator session. This is the left pane of the builder and the pre-publish link. |
| `app/operator/events/new/page.tsx` | REPLACE - the four-step wizard dies. Creates a smart-defaulted draft via `createEventDraft` and lands in the builder. |
| `app/operator/events/[id]/builder/page.tsx` + `_components/BuilderShell.tsx` | NEW - single live record: left = live preview (the preview route, refreshed on save), right = control rail. Core always visible (title, date/time, location, cover, Access); Advanced progressively disclosed (capacity/waitlist, fee toggle, comp codes, confirmation content). 60-90 second happy path; publish is a switch on a page already seen. |
| `app/operator/events/[id]/_components/GateBuilderTab.tsx` | EVOLVE into the rail's Access section - chips-as-a-sentence (spec 7.2), depth-2 cap, honesty badges, templated gates (Open / Paid ticket / Apply to attend / Members + paid), "make these a choice" grouping, PAY-node price chips (C1 replaces tiers), the gate-replaces-door notice (M4 follow-up), all mutations through `lib/builder/actions.ts`. |
| `_components/QuestionsTab.tsx`, `_components/RegistrationFieldsEditor.tsx`, `_components/TierManager.tsx`, `_components/WorkflowSection.tsx` | RETIRE from the new surface (C1/C2; WorkflowSection is the ghost-card editor). Removed with the replaced pages; files deleted only when no live reference remains, listed in the report. |
| `lib/gate-engine/conditions/answer-questions.ts` | MODIFY (C2, registry plugin not evaluator) - `review: 'collect'` mode: store answers as proof, skip scoring. |
| `app/e/[slug]/page.tsx` | MODIFY (minimal) - consume the split loader; rendering identical. |
| Tests | NEW - action-layer suite (incl. the acceptance-3 zero-legacy-writes assertion), preview-token suite, Playwright builder happy path + preview parity (`/e/preview` HTML vs post-publish `/e/[slug]` HTML for the same event). Screenshots (Decision 7): guest page mobile + desktop, draft + published, and the builder - required in the report. |

## Phase C - Refunds + demolition (Spine + Warden)

| File | Change |
|---|---|
| `lib/commerce/refund.ts` | NEW - the per-refund state machine EXTRACTED from `app/api/stripe/refund/route.ts` (cancel vs refund paths, cumulative idempotency keys, RSVP/Order state writes, audit) so single and mass refund run one machine. Full refund additionally revokes the PAY GateProof for that event (engine proof surface; per-event scope, PAY never carries) and expires the Order/Ticket. Partial refund keeps seat + proof. |
| `app/api/stripe/refund/route.ts` | MODIFY (unfrozen by directive) - delegate to lib/commerce/refund.ts; behavior identical for v1 rows plus proof revocation for gate rows. |
| `app/api/operator/events/[id]/refund-all/route.ts` | NEW - ADMIN mass refund: `{ dryRun: true }` returns count + total of refundable rows (CAPTURED/AUTHORIZED, not fully refunded); execute iterates the shared machine, failures isolate into a per-row result list, retries dedupe via the cumulative keys. Rate-limited. |
| `app/api/webhooks/nobc/stripe/route.ts` | MODIFY (unfrozen) - `charge.refunded` at full-refund triggers the same revocation path (idempotent with the admin route). |
| `app/api/operator/rsvps/[id]/refund/route.ts`, `app/api/stripe/checkout/route.ts`, `app/api/stripe/create-payment-intent/route.ts` | DELETE - the three orphans (audit item f). Reference sweep proves zero callers first. |
| `lib/events.ts` | MODIFY - `getEventBySlug` gains a status guard: DRAFT visible only to STAFF+ of the workspace (the builder/preview need it); plain members see PUBLISHED only (audit item h). |
| Warden pass | REVIEW - every new/modified money route: requireRole, rate limits, idempotency, IDOR (workspace scoping on every id), fail-closed. Findings fixed in-phase and listed in the report. |
| Tests | NEW - mass refund dry-run/execute/idempotency/isolation; refund-revokes-proof full vs partial; DRAFT-visibility fix; orphan-route deletion sweep. |

## Phase D - Cutover package (Spine + Proof) - deliverables only, NO cutover

1. `scripts/cutover/nbs-to-v3.ts` - dry-run-first converter for event `cmqr8wojk000004kzc90yxxy3`:
   reads the live eventAccess JSON, synthesizes the equivalent v3 Gate (PAY 2500 composition per the
   actual prod shape), leaves every legacy field untouched (additive + reversible, spec 11.2). Dry
   run prints the exact writes; Adam executes against prod himself. Rehearsed on the ep-sweet-term
   NBS replica from Phase 0.
2. Reconciliation plan (in the checklist doc): each of the five `ACTIVE_EVENT_ID` import sites +
   DoorFork + the hardcoded object-contain hero - what replaces each (gate composition, per-event
   page settings, agent/approve/reject comp wiring successor). Any new Event column it demands is
   flagged additive-only; none is assumed.
3. `_context/_audit/EVENT-BUILDER-CUTOVER-CHECKLIST.md` - ordered steps, each marked ADAM-GATE or
   SAFE, from "merge branch" through "run converter dry-run", "flip read path", "retire seams",
   ending at "marketing can start."
4. Phase 0 baseline test re-run green (acceptance 8).

## Phase E - AI event composition (Spine + Prism)

| File | Change |
|---|---|
| `lib/builder/compose.ts` | NEW - JUDGMENT_MODEL `generateObject` -> typed CompositionPlan (details, gate tree, prices, cap, fee mode, smart-default flags); plan executed server-side EXCLUSIVELY through `lib/builder/actions.ts` (zero direct DB writes, publish action never invoked, Stripe never touched). Returns eventId + composed summary. |
| `app/operator/_components/ComposeEventBox.tsx` + dashboard wiring | NEW - prompt box on the operator dashboard; success lands in the builder preview with the composed summary (smart defaults flagged). |
| `app/api/agent/event-builder/route.ts` | RETIRE - the old write-nothing draft scaffolder is superseded; deleted once the new path lands (flagged in report). |
| Tests | NEW - plan schema; execution-through-actions with a mocked model plan for the acceptance prompt ("Saturday dinner at Chateau Chloe, $40, members free, 60 cap, apply or pay" -> root ANY_1 [HOLD_MEMBERSHIP, PAY 4000, ANSWER_QUESTIONS], capacity 60, DRAFT, zero publish, zero Stripe); one optional live-model run env-gated off. |

## Acceptance mapping

| # | Acceptance | Phase |
|---|---|---|
| 1 | Publishable draft < 90s, no required-field wall | B |
| 2 | Preview and published render = same code path | B (split loader by construction + parity test) |
| 3 | New events write ONLY v3 shape | B (action-layer test) |
| 4 | PAY -> test intent -> Order + Ticket -> door list | A |
| 5 | Comp code -> no Stripe -> COMP_CODE proof -> Ticket -> door list | A |
| 6 | Fee toggle changes charge + transparent line item; absorb = flat | A (+ B UI) |
| 7 | Full refund revokes proof + seat; partial keeps seat; mass refund dry-run + idempotent | C |
| 8 | NBS render unchanged (baseline pinned first) | 0 + D |
| 9 | tsc 0, eslint 0, suite regresses zero beyond 5 known | every phase gate |

## Frozen / protected map honored

- FROZEN, untouched: MembershipForm internals, lib/scoring.ts, config/archetypes.ts,
  `lib/gate-engine/evaluate.ts` internals (all engine access via index/orchestrate/authoring/proofs
  public surface; condition plugins are registry extensions, not evaluator internals - C2 flagged).
- PROTECTED until cutover, built alongside: NBS eventAccess JSON + price location, blanked
  EventWorkflow.paths row, TemplateSplit/isActiveEvent/DoorFork/ACTIVE_EVENT_ID, Door-1 comp wiring
  in the apply submit route. Phase 0's baseline test enforces this mechanically.
- UNFROZEN and in scope, every diff flagged: EventAccessFlow, buildSteps, v1 money routes being
  replaced, admin refund route, Stripe webhook route.

## Verification protocol (every phase gate)

tsc --noEmit 0 - npx eslint on changed files 0 - full unit suite (zero regressions beyond the 5) -
phase acceptance rows created and read back on ep-sweet-term - Phase 0 NBS baseline green -
Prisma via `node node_modules/prisma/build/index.js` only - commit per phase on this branch.
