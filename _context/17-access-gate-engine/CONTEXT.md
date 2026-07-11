# Stage 17 — Access Gate Engine v3 (M1: headless engine core)

> Replaces the three hardcoded access forks (open Access / paid ticket / apply) with one engine: a Gate is a boolean expression tree of tiered-verification conditions, evaluated fail-closed, with persistent proofs and a growth graph write path.

## Status

| Field | Value |
|---|---|
| **State** | 🟢 MERGED + IN PRODUCTION — `feat/event-builder-rebuild` (M1–M4-PAY + builder rebuild + D6 + Night + Loose Ends + Ways-In Phase A) merged to `main` via `ecf1d07` 2026-07-03; deployed to production (Adam verified via Vercel, 2026-07-10). Person-primary retrofit drafted on `feature/gate-engine-person-primary-retrofit` (schema + SQL artifact, NOT applied) |
| **V1 item** | None — post-July-11 platform work (v3 roadmap: engine, guest render, Builder, cutover surfaces + pay all built) |
| **Last updated** | 2026-07-10 |
| **Owner** | Adam |
| **Blocked on** | (1) Adam reviews `feature/gate-engine-person-primary-retrofit` and runs `prisma/sql/gate-engine-person-primary-retrofit.sql` (sections 1→2→3) manually in Neon — production is his act. (2) DB-application status of the earlier gate SQL artifacts (`gate-engine-m1.sql`, `ways-in-phase-a.sql`, `event-builder-phase-a/f.sql`, `stripe-event.sql`) against PRODUCTION is undocumented here — the code referencing these tables is live in prod, so they are presumably applied, but Adam should confirm and record it (recon Q3). (3) `application_submitted` emitter name reconciliation with the CRM owner (unchanged). |
| **Next** | 2026-07-10 — DOC RECONCILIATION + PERSON-PRIMARY RETROFIT drafted (branch `feature/gate-engine-person-primary-retrofit`, local only): nullable `personId` dual pointers on GateProof + GateSession, `fromPersonId`/`toPersonId` on GrowthEdge; member FKs keep RESTRICT (pinned explicitly in schema.prisma); the three NOT-NULL widenings are isolated in the SQL's Section 2 (Adam-approved exception to the refuse-ALTERs rule); 4 out-of-band partial uniques in Section 3 (CLAUDE.md landmine entries once applied). Proof: `prisma generate` clean; `tsc --noEmit` clean with ZERO code changes (no engine/verifier/bridge edits needed); 161 pure gate-engine + ways-in unit tests green (DB suites deliberately not run — zero DB contact this session). Ground-truth recon that triggered all this: `docs/gate-engine-m1-recon.md`. NEXT ACTION: Adam reviews the branch, runs the retrofit SQL in the Neon console, and records prod DB-application status of the prior gate SQL artifacts (recon Q3). Spec disposition is settled (recon Q1): v3 substrate stays, flat spec's schema retired, flat POLICY decisions carried over (already match live code). The 2026-07-01→07-06 build log that previously lived in this row is preserved in this file's git history. |

## As-built (verified 2026-07-10 — full audit in `docs/gate-engine-m1-recon.md`)

- **Merged and live.** `ecf1d07` ("Merge branch 'feat/event-builder-rebuild'") landed on `main` 2026-07-03 and is deployed to production (Adam verified via Vercel, 2026-07-10). Earlier revisions of this file said "UNMERGED by design" — no longer true, removed.
- **The shipped model is the v3 nested `GateNode` tree** (GROUP rule ALL/ANY_N/WEIGHTED, `required`/`weight` per child, engine-enforced depth ceiling) — NOT the flat spec's schema.
- **Seven registered condition types, not five:** `pay`, `answer-questions`, `referred-by-member`, `attended-prior`, `hold-membership`, plus `collect-info` and `open`. The last two appear in NEITHER spec and are documented here as-built: `open` is the canonical open-door passive condition minted on fresh builder drafts (the fail-closed evaluator means "anyone can get in" must be a verifier that says so); `collect-info` gathers registration answers and the commerce bridge persists them to `RSVP.customAnswers`.
- **Spec disposition (Adam, 2026-07-10, final):** the flat builder spec (`NoBadOS__spec__access-gate-engine-and-builder__2026-06-26.md` — never committed to this repo) is **policy-reference-only**; its schema is superseded by the shipped v3 tables. Its policy decisions carry over and already match live code: human-review-on posture, per-condition carry-forward windows (answers 12 months / attended-prior never expires / pay never carries / membership live-only), templates as on-ramps.
- **Person-primary retrofit** (2026-07-10, branch `feature/gate-engine-person-primary-retrofit`): `GateProof`/`GateSession` gain a nullable `personId`, `GrowthEdge` gains `fromPersonId`/`toPersonId`; person-side uniqueness lives in 4 out-of-band partial unique indexes (`prisma/sql/gate-engine-person-primary-retrofit.sql`, **NOT applied**). Until Adam runs that SQL, the production gate layer remains Member-keyed.

## Scope

M1 only: the headless engine core. Five additive tables (Gate, GateNode, GateProof, GrowthEdge, GateSession), the recursive evaluator (pure core + effectful orchestrator), the condition type contract + open registry, the five M1 verifiers (PAY, ANSWER_QUESTIONS, REFERRED_BY_MEMBER, ATTENDED_PRIOR, HOLD_MEMBERSHIP), proof persistence with §16.4 carry-forward, and the REFERRAL GrowthEdge write path. Proven by tests on real seeded rows. Responsibility ends where rendering begins: no UI, no guest render, no Builder, no `/e/` changes, no backfill of existing events.

## Files in play

```
prisma/schema.prisma                          ← 5 additive models + 8 enums (end of file)
prisma/sql/gate-engine-m1.sql                 ← reviewed additive migration (PRODUCTION application
                                                 unconfirmed in docs - recon Q3; Adam to record)
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
prisma/sql/gate-engine-person-primary-retrofit.sql ← (Person-primary retrofit) additive SQL - NOT applied;
                                                 3 NOT-NULL widenings isolated in Section 2, 4 out-of-band
                                                 partial uniques in Section 3 (Adam runs manually in Neon)
docs/gate-engine-m1-recon.md                  ← 2026-07-10 recon: as-built ground truth, chokepoints,
                                                 purchase-proof audit, flat-spec disposition
```

## Inputs

- Gate definitions authored via `createGate()` (tests/authoring helper in M1; Builder UI is M3)
- Member submissions to `verifyCondition()` (payment intent ids, application ids, referral facts)
- Existing rows the verifiers read: `Member.referredByMemberId`, `Member.approved`/`status`, `RSVP.checkedIn`, Stripe payment intent state via `lib/stripe.ts` (read-only)
- `scoreApplication()` from `lib/scoring.ts` (wrapped, never edited)

## Outputs

- `GateDecision` (Open / not-Open, fail-closed) from `evaluateGate()`
- `GateProof` rows — one live proof per (nodeId, memberId), honest tier + mechanism, carry-forward lineage (Person-primary retrofit adds a `personId` dual pointer; person-side uniqueness = out-of-band partial index, pending SQL application)
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
