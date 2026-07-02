# Stage 17 — Access Gate Engine v3 (M1: headless engine core)

> Replaces the three hardcoded access forks (open Access / paid ticket / apply) with one engine: a Gate is a boolean expression tree of tiered-verification conditions, evaluated fail-closed, with persistent proofs and a growth graph write path.

## Status

| Field | Value |
|---|---|
| **State** | 🟡 In progress — M1 (engine core) + M2 (guest render) + M3 (Builder) + M4 (bridge, `/e/` minting, rate limits) + M4-PAY (in-page Stripe pay flow, auto-capture, greenlit 2026-07-02) code-complete on stacked branches `feat/gate-engine-m1/-m2/-m3/-m4/-m4-pay`; all acceptance green on ep-sweet-term incl. a live test-mode end-to-end payment; UNMERGED by design (Adam's gate) |
| **V1 item** | None — post-July-11 platform work (v3 roadmap: engine, guest render, Builder, cutover surfaces + pay all built) |
| **Last updated** | 2026-07-02 |
| **Owner** | Adam |
| **Blocked on** | Adam's approval of the Event Builder Rebuild phase plan (`docs/superpowers/plans/2026-07-02-event-builder-rebuild.md`, branch `feat/event-builder-rebuild` cut from m4-pay 79d483c). Live charges stay OFF until Adam sets `GATE_PAY_LIVE_CHARGES=1` on a live key. Secondary: the v3 spec file is still not committed to the repo (lives untracked at the main checkout root). |
| **Next** | 2026-07-02 — Apex directive: Event Builder Rebuild (v3 cutover) phase plan written and AWAITING APPROVAL. Phases: 0 baseline harness, A commerce spine (Order/Ticket/PromoCode/service fee), B builder surface + actions layer + true anon draft preview, C refunds complete + orphan demolition, D cutover package (NBS converter + checklist, no cutover), E AI composition through the same actions. The M4 follow-ups (refund-revokes-proof, gate-replaces-door notice) are folded into Phases C and B respectively. On approval: build Phase 0 first (NBS render baseline pinned before any change). |

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
                                                 attended-prior,hold-membership}
app/gate/[token]/ + app/api/gate/[token]/     ← (M2) public guest walkthrough + token API
app/api/operator/events/[id]/gate/…           ← (M3) operator gate CRUD + preview + sessions
app/operator/events/[id]/_components/GateBuilderTab.tsx ← (M3) Builder split-view (Access Gate tab)
tests/unit/gate-engine/                       ← truth tables + acceptance/guest-flow/authoring DB suites
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
