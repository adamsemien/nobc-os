# Stage 17 — Access Gate Engine v3 (M1: headless engine core)

> Replaces the three hardcoded access forks (open Access / paid ticket / apply) with one engine: a Gate is a boolean expression tree of tiered-verification conditions, evaluated fail-closed, with persistent proofs and a growth graph write path.

## Status

| Field | Value |
|---|---|
| **State** | 🟡 In progress — M1 (engine core) + M2 (guest render) + M3 (Builder) + M4 (bridge, `/e/` minting, rate limits) + M4-PAY (in-page Stripe pay flow, auto-capture, greenlit 2026-07-02) code-complete on stacked branches `feat/gate-engine-m1/-m2/-m3/-m4/-m4-pay`; all acceptance green on ep-sweet-term incl. a live test-mode end-to-end payment; UNMERGED by design (Adam's gate) |
| **V1 item** | None — post-July-11 platform work (v3 roadmap: engine, guest render, Builder, cutover surfaces + pay all built) |
| **Last updated** | 2026-07-06 |
| **Owner** | Adam |
| **Blocked on** | (1) Ways-In Phase A: Adam runs `prisma/sql/ways-in-phase-a.sql` manually in Neon (two sections, run SEPARATELY - enum ADD VALUE cannot share a transaction block with the CREATE TABLE) and reviews + merges `feat/ways-in-phase-a`; the `application_submitted` emitter stays a TODO stub pending name reconciliation with the CRM owner (`application_submitted` vs `application_started`). (2) Prior gate: Adam's review + merge of `feat/event-builder-rebuild` (phases 0-F + D6 + Night + Loose Ends complete, all acceptance green). Cutover to the live NBS event is HIS act via `_context/_audit/EVENT-BUILDER-CUTOVER-CHECKLIST.md` (converter dry-run first). Live charges stay OFF until `GATE_PAY_LIVE_CHARGES=1` on a live key. |
| **Next** | 2026-07-06 — WAYS-IN PHASE A SHIPPED on `feat/ways-in-phase-a` (unmerged, no deploy; spec `_context/_specs/NoBadOS__spec__ways-in-access-model__2026-07-06_rev2.md` §10 Phase A): (1) `EventAccessModel` table, additive only - the authored Ways-In list is the persisted source of truth, the gate tree a pure compile artifact; SQL artifact `prisma/sql/ways-in-phase-a.sql` NOT applied (Adam runs its two sections separately in Neon). (2) `lib/ways-in/` - Zod model (all seven dials stored; pay/apply/nothing/referred compile; `screening` reserved + compiler-rejected until Phase C), one-way compiler to root GROUP(ANY_N,1) of GROUP(ALL) Way-In children with id-stable recompiles via `compiledMap` (guests' proofs survive edits), `saveWaysIn` compile-on-save through the engine authoring API only (no engine internals touched), sha256 semantic tree-hash + `getAdvancedGateStatus` (hash mismatch → hand-edited → "advanced", fail-closed to advanced), `deriveSatisfiedWayIn` (§2.4 - winner = first satisfied in list order, carries priceCents). Ships DARK: no production caller until Phase B. (3) Six §4 fact emitters, exactly-once each: ticket_purchased + rsvp_confirmed (recordPaidAdmission), rsvp_confirmed (recordCompAdmission + ensureOpenAdmission - now returns `{newlyConfirmed, rsvpId}`), rsvp_cancelled (operator cancel route dual-write + lib/waitlist cancelRsvp), comp_issued (comp route alongside its audit write), access_requested (gate token route, anonymous→identified transition via a route-level session pre-read - guest-session.ts untouched per Adam's flag #1 resolution), waitlist_promoted (promote-waitlist route dual-write + agent rsvps.promote). emitEvent engagement gained optional personId; enum value + timeline label for access_link_redeemed (no emitter until Phase C's one-off links). application_submitted = TODO stub in the membership submit route naming both candidates, ON HOLD for CRM-owner reconciliation. Proof: tsc clean; +50 tests (tests/unit/ways-in/), suite 1085 pass / 4 fail (the 4 = the known pre-existing apply-create-route failures, byte-identical to the pre-build baseline run); all 16 frozen-zone files sha256-identical before/after. NEXT: Adam runs the SQL, reviews + merges the branch; then Phase B (authoring surface + verbs + MCP-to-verbs + scoped freeze + step-11 demolition) per spec §10, Chloe's veto on its UX/language. Prior context: 2026-07-03 — LOOSE ENDS SHIPPED (Adam's four-phase directive, Phase 1): (L1) default gate on create — every fresh builder draft mints the canonical open gate (`openGateSpec()`: GROUP ALL with one passive `OPEN` condition, new registered type in `lib/gate-engine/conditions/open.ts`; the frozen evaluator fail-closes empty groups, so "anyone can get in" is a verifier that says so). The anon DTO gained `gateOpen` (all condition nodes OPEN, fail-closed on empty) and the open door's CTA reads "Register" per copy law; the rail round-trips the open spec as its "open" kind; compose never sends null. Acceptance: tests/unit/builder-actions.db.test.ts "loose ends L1" — fresh draft → gated+gateOpen DTO, anon guest identifies → confirmed seat; ungated counterfactual pinned. (L5) capacity copy pluralizes ("Limited to 1 spot"). (L6) per-event hero fit (`pageStyle.heroFit` cover|contain, no DDL — deviation from the cutover checklist's "additive column" sketch) with a rail "Cover fit" select next to the cover upload; all three templates honor it; the `isActiveEvent` contain hack stays ORed until cutover step 10 retires it. (L7) series-scoped discount codes redeem at gates through the same server-stamped path (`checkDiscountCode` takes the event's own `seriesId`; event-scoped wins a code collision; race held — 4 new tests in promo-discount.db.test.ts). (L8) the v3 spec file is committed at `_context/17-access-gate-engine/`. Plan doc: docs/superpowers/plans/2026-07-03-event-builder-loose-ends.md. Directive Phase 2 also SHIPPED (same day): Night card-depth fix, token file only (+8/-4, one commit, one-line revert for Chloe's veto) — ground #2c1332→#220e26, card #2d1c42→#38254b, separation 1.088→1.324, all AA pairs re-proven (binding: card-borne lavender text 4.55), frozen-zone bridge --apply-cream tracks the card; reshot guest-night desktop+mobile+parity (builder shot still blocked on the headless Clerk handshake). Phase 2b (amendment, same day): Night nav accent resolution — new `--ev-brand-accent` (wordmark accent as a token so a future Night brand mark is an asset swap) + `--ev-nav-cta-*` slots (paper = the exact prior solid-red Apply; night = cream ghost with lavender hover — deliberately NOT a second lavender fill, the access card's CTA keeps the one bright note); frozen-zone bridge extended to rebind `--nobc-red/-hover/-on-red` inside night scope so the frozen EventAccessFlow's reds (CTA, dots, focus rings, errors) resolve to the accent system — red appears nowhere on a Night guest page (tradeoff flagged for Chloe: flow errors render lavender on night). Wordmark spans across MemberShellNav/Footer + all three templates + .ev-title-accent now speak the brand token (pixel no-op on paper — proven by paper shots + NBS baselines). Discipline note for Chloe: the category eyebrow + CapacityMeter fill also adopt --ev-accent on night views (third-element competition, not fixed per amendment). NEXT: Adam reviews the branch (Loose Ends + card depth + nav) and walks the cutover checklist. Prior context: D6 partial-discount promo codes SHIPPED through the PAY verifier (follow-up #2 closed): server-stamped discount at intent mint, node-bound stamp honored by the verifier (full-price replay defense intact for everything else), fee on the discounted price, D9 guarded maxUses claim inside the admission transaction with the Phase F race-lose auto-refund treatment (`gate.promo_race_refunded`), PromoRedemption + honest Order split, builder-rail create/list inside the codes area, one guest code field with server classification (comp codes route to the existing zero-Stripe machinery). No schema changes; the schema's fixed-amount DiscountType is `flat`. Acceptance: tests/unit/gate-engine/promo-discount.db.test.ts 11/11 on ep-sweet-term incl. the concurrent last-use race and the refunded-loser no-free-seat guard (a bridge hole found and fixed during the build: a stale open decision after a race refund could hand out a confirmed seat). Plan doc: docs/superpowers/plans/2026-07-02-event-builder-d6-promo-discounts.md. Phase 2 SHIPPED same day: event-page theme contract (app/event-themes.css - ground/depth/voice/glow tiers; paper default resolves to the exact prior values), Night purple-velvet theme as pageStyle.theme (token file only, AA-proven contrast, one lavender note per view), zero --apply-*/raw-hex on target surfaces (EventAccessFlow frozen-zone exempt via a scoped rebinding bridge; wallet badges third-party brand exempt), builder rail Page theme control beside the template picker, error/success feedback made distinct, QR colors centralized (QR_RENDER_COLORS). Preview-vs-published parity holds under Night (same assembly). Known gap: the builder-desktop screenshot is blocked - headless Clerk handshake refuses the test login and the real browser has no dev-instance session; guest shots delivered. NEXT: Adam reviews the branch + report (D6 + Night), then walks the cutover checklist. Known follow-up: gateless-draft default-vs-Open copy mismatch (unchanged, resolve at cutover). |

## Scope

M1 only: the headless engine core. Five additive tables (Gate, GateNode, GateProof, GrowthEdge, GateSession), the recursive evaluator (pure core + effectful orchestrator), the condition type contract + open registry, the five M1 verifiers (PAY, ANSWER_QUESTIONS, REFERRED_BY_MEMBER, ATTENDED_PRIOR, HOLD_MEMBERSHIP), proof persistence with §16.4 carry-forward, and the REFERRAL GrowthEdge write path. Proven by tests on real seeded rows. Responsibility ends where rendering begins: no UI, no guest render, no Builder, no `/e/` changes, no backfill of existing events.

## Files in play

```
prisma/schema.prisma                          ← 5 additive models + 8 enums (end of file)
prisma/sql/gate-engine-m1.sql                 ← reviewed additive migration (NOT yet applied)
docs/superpowers/plans/2026-07-01-gate-engine-m1.md  ← the Phase B build contract
lib/gate-engine/                              ← engine core: types, registry, validate, evaluate,
                                                 orchestrate, proofs, growth, authoring (M3 read/
                                                 update/delete), guest-view + guest-session (M2),
                                                 conditions/{pay,answer-questions,referred-by-member,
                                                 attended-prior,hold-membership,collect-info,open}
_context/17-access-gate-engine/NoBadOS__spec__access-gate-engine-and-growth-platform-v3__2026-06-26.md
                                              ← the v3 spec (committed 2026-07-03, Loose Ends L8)
app/gate/[token]/ + app/api/gate/[token]/     ← (M2) public guest walkthrough + token API
app/api/operator/events/[id]/gate/…           ← (M3) operator gate CRUD + preview + sessions
app/operator/events/[id]/_components/GateBuilderTab.tsx ← (M3) Builder split-view (Access Gate tab)
tests/unit/gate-engine/                       ← truth tables + acceptance/guest-flow/authoring DB suites
lib/ways-in/                                  ← (Ways-In Phase A) authored access model: schema (Zod),
                                                 compile (one-way list→tree), save (compile-on-save),
                                                 advanced (semantic tree-hash flag), derive (§2.4)
prisma/sql/ways-in-phase-a.sql                ← (Ways-In Phase A) additive SQL artifact - NOT applied;
                                                 Adam runs the two sections SEPARATELY in Neon
tests/unit/ways-in/                           ← (Ways-In Phase A) compile/advanced/derive/save +
                                                 emitter exactly-once suites (lib + route layers)
_context/_specs/NoBadOS__spec__ways-in-access-model__2026-07-06_rev2.md ← the Ways-In spec (rev.2)
scripts/seed-gate-m1.ts                       ← deterministic acceptance seed
docs/superpowers/plans/2026-07-0*-gate-engine-m*.md ← per-milestone build contracts + deviations
```

## Inputs

- Gate definitions authored via `createGate()` (tests/authoring helper in M1; Builder UI is M3)
- Member submissions to `verifyCondition()` (payment intent ids, application ids, referral facts)
- Existing rows the verifiers read: `Member.referredByMemberId`, `Member.approved`/`status`, `RSVP.checkedIn`, Stripe payment intent state via `lib/stripe.ts` (read-only)
- `scoreApplication()` from `lib/scoring.ts` (wrapped, never edited)

## Outputs

- `GateDecision` (Open / not-Open, fail-closed) from `evaluateGate()`
- `GateProof` rows — one live proof per (nodeId, memberId), honest tier + mechanism, carry-forward lineage
- `GrowthEdge` REFERRAL rows (workspace-scoped)
- `GateSession.lastDecision` snapshots
- Downstream: M2 guest render and M3 Builder consume this engine's API surface

## Rules — DO NOT VIOLATE

1. **Fail-closed everywhere.** Any verifier error, malformed node, unregistered type, or ambiguous state evaluates NOT Open. Never throw on the grant path; log with context.
2. **No condition type is usable until its server-side verifier exists and is tested.** The registry invariant test enforces this.
3. **Proof honesty:** tier + mechanism are stamped from contract constants, never from verifier return values. An attestation is never stored as first-party truth.
4. **Locked §16 decisions:** depth ceiling = flat + depth-2; carry-forward windows = attended-prior never expires, membership always, payment per-event never carries, answers 12 months from original verification (window never refreshes on carry). Argue changes in a report; never override mid-run.
5. **Frozen zones read-only:** `lib/scoring.ts`, `MembershipForm.tsx`, `EventAccessFlow.tsx`, v1 engine (`lib/event-access*.ts`, `deriveFlow`, `buildSteps`), `config/archetypes.ts`, every Stripe payment route. The PAY verifier reads intent state only.
6. **This migration is applied to the confirmed dev/scratch branch only** (`db execute`, never `db push`); production application is Adam's, in the Neon console, at M4 cutover earliest.
7. M1 is headless — any string the engine can emit (guestPrompt, log/DTO copy) still honors brand law: "Access" not "RSVP", "No Bad Company" never "NBC", spaced hyphens, no raw enum values.

## What this stage does NOT own

- **04-access** owns the live v1 access flow (`lib/event-access*.ts`, EventAccessFlow) — untouched until M4 backfill/cutover
- **05-payments** owns charge/capture/refund routes — PAY only reads intent state
- **01-apply / 02-approval** own the application form + scoring pipeline — ANSWER_QUESTIONS wraps `scoreApplication()`
- **M2+ milestones** own guest render, Builder split-view, backfill/cutover, Cmd+K/agent surfaces, and all v3.1 condition types
