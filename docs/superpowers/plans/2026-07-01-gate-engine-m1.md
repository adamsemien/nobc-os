# Access Gate Engine v3 - Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the headless gate engine core - recursive evaluator, condition registry, 5 verifiers, proof persistence with carry-forward, and the GrowthEdge write path - proven correct by tests on real seeded rows, on branch `feat/gate-engine-m1`, unmerged.

**Architecture:** A Gate is a boolean expression tree (GateNode) over a polymorphic resource. A pure, side-effect-free evaluator core (`evaluateTree`) computes Open/not-Open from a materialized tree plus a proof index; an effectful orchestrator (`evaluateGate`) loads workspace-scoped rows, runs carry-forward and passive verifiers, persists proofs, and calls the pure core. Condition types are plugins in an open registry; no type is usable until its verifier exists and is tested.

**Tech Stack:** Next.js 15 / TypeScript, Prisma 7 + Neon Postgres (dev branch `ep-sweet-term`), Zod for condition configs, Vitest for unit + DB acceptance tests, Stripe SDK (read-only) via `lib/stripe.ts`.

**Status:** Phase A approved artifacts only. Phase B (tasks below) does NOT start until Adam approves the plan + `prisma/sql/gate-engine-m1.sql` and confirms the target database.

---

## Locked decisions carried (Adam's §16, not overridable mid-run)

- **Depth ceiling (§16.1):** flat + depth-2. Root GROUP at depth 0, one nested GROUP level at depth 1, CONDITION leaves at depth <= 2. Enforced at authoring time by the validator AND at evaluation time (fail-closed) as defense in depth.
- **Carry-forward windows (§16.4):** ATTENDED_PRIOR never expires; HOLD_MEMBERSHIP always carries; PAY is per-event, never carries; ANSWER_QUESTIONS carries 12 months from original verification, then re-ask. IG-follow is v3.1 - ignored. We never re-verify what we already know.

## Design deviations from the spec (standing design authority - deviate freely, document always)

> The v3 spec file is not in the repo (searched exhaustively 2026-07-01); the mission brief's section-by-section restatement is the operative requirements document. Deviations below are relative to that brief; reconcile against §11.1 if the spec file surfaces.

| # | Deviation | Rationale |
|---|---|---|
| D1 | `conditionType` is a String registry key, not a Postgres enum | New condition types (v3.1 has ten) must not require DDL; the registry + Zod validate instead. |
| D2 | Added `GateProofStatus` (SATISFIED / REJECTED / PENDING_REVIEW) | ANSWER_QUESTIONS returns `needsHuman`; without a pending state the engine must falsely reject or discard AI work. Anything != SATISFIED is not Open - fail-closed preserved. |
| D3 | `GateProof.nodeId` nullable, `onDelete: SetNull`; `conditionType` + `sourceProofId` denormalized onto proofs | The (nodeId, memberId) unique alone cannot express cross-event carry-forward, and proof history must survive gate edits/deletion. |
| D4 | Carry-forward = copy-on-landing: mint a node-anchored proof from the prior proof, keeping the ORIGINAL `expiresAt` and recording `sourceProofId` | Honors "one live proof per (nodeId, memberId)" literally, keeps the evaluator a dumb lookup, and prevents the 12-month answers window from refreshing on copy. |
| D5 | Pure evaluator core + effectful orchestrator split | The correctness-critical recursion becomes exhaustively unit-testable truth tables with zero mocks. |
| D6 | `VerificationTier` ships only FIRST_PARTY (Tier 1) and AI_ATTESTED (Tier 3) | Only tiers M1 actually stamps; later tiers are additive `ALTER TYPE ... ADD VALUE` when their milestones land. |
| D7 | `ProofMechanism` = INTERNAL_RECORD / STRIPE_PAYMENT / AI_SCORING | The three mechanisms M1's five verifiers actually use. |
| D8 | Root node must be a GROUP; OR is modeled as ANY_N with requiredCount 1 | One canonical tree shape kills a class of evaluator edge cases; single-condition gates are a root ALL group with one child. |
| D9 | One Gate per (workspaceId, resourceType, resourceId) - no draft/versioning | YAGNI for a headless milestone; Builder (M3) can add versioning additively. |
| D10 | GrowthEdge deduped by (workspaceId, type, fromMemberId, toMemberId) | An aggregatable graph wants one edge per pair; repeat referrals don't multiply edges (proof history holds the events). |
| D11 | PAY verifier requires the payment intent to be traceable to THIS member (metadata.memberId or an internal Payment/RSVP row match) besides `succeeded` + amount >= priceCents | Replay defense: without it any guest could satisfy PAY with someone else's intent id. |
| D12 | PAY reads Stripe through an injectable `StripeIntentReader` port (production default: `lib/stripe.ts` singleton) | Acceptance tests run on real DB rows without network flakiness; the payment ROUTE paths are untouched (frozen). |
| D13 | GateSession kept minimal (token, status, lastDecision snapshot, expiry) | Headless milestone; M2 guest render extends additively once real UX needs exist. |
| D14 | REFERRED_BY_MEMBER carry-forward = ALWAYS (not in §16.4) | It is a permanent internal record (`Member.referredByMemberId`); re-deriving is free and the fact never becomes false. |
| D15 | ATTENDED_PRIOR reads RSVP rows (`checkedIn = true`), not the denormalized `Member.totalEventsAttended` | Source-of-truth over counter; the counter can drift. |
| D16 | Carry-forward matches on conditionType only (not config hash) in M1 | No M1 condition has config-divergent reuse semantics yet; config-hash matching is additive when a real case appears. Documented limitation. |

**Argued, not overridden (Adam to rule):** §16.4 "membership always" carries a revoked-member risk - a member approved once, later revoked or red-listed, still holds a live HOLD_MEMBERSHIP proof. Recommendation: change HOLD_MEMBERSHIP to always-live-re-verify (it is one indexed lookup, effectively free, and revocation-safe). Implemented as LOCKED (carries always) until Adam unlocks.

---

## Data model (applied in Phase B via `prisma db execute`, dev branch only)

See `prisma/schema.prisma` (five models at the end) and `prisma/sql/gate-engine-m1.sql` (reviewed, 100% additive). Summary:

- **Gate** - one per (workspace, resourceType, resourceId). Tree root = the node with `parentId = null`.
- **GateNode** - CONDITION (conditionType + config Json) or GROUP (rule ALL/ANY_N/WEIGHTED, requiredCount, weightThreshold). `required` blocks Open regardless of parent rule. `weight` is the node's weight within a WEIGHTED parent. Cascade-deletes with its gate/parent.
- **GateProof** - unique (nodeId, memberId); status/tier/mechanism stamped from the contract, never from verifier return values; `expiresAt` computed from the carry-forward policy; `sourceProofId` = carry-forward lineage; survives node deletion via SetNull.
- **GrowthEdge** - REFERRAL only in M1; unique per (workspace, type, from, to); optional resource + proof provenance.
- **GateSession** - anonymous-capable traversal record with `token` resume handle and `lastDecision` snapshot.

## Evaluation semantics (normative - tests encode exactly this)

1. **CONDITION** is satisfied iff a proof exists for (nodeId, memberId) with `status = SATISFIED` and (`expiresAt` null or `> now`). `now` is a parameter of the pure core.
2. **GROUP**: evaluate children first. Every child with `required = true` must be satisfied or the group is unsatisfied regardless of rule. Then: ALL - every child satisfied; ANY_N - count of satisfied children `>= requiredCount`; WEIGHTED - sum of `weight ?? 0` over satisfied children `>= weightThreshold`.
3. **Fail-closed, exhaustively:** unregistered conditionType, config that fails the Zod schema, GROUP without rule, ANY_N without requiredCount, WEIGHTED without weightThreshold, empty GROUP, CONDITION without conditionType, node depth beyond the ceiling, no root, multiple roots, verifier throw, verifier timeout - each evaluates unsatisfied (with an internal-only reason code), never Open, never a thrown error on the grant path.
4. **Gate is Open** iff the root node is satisfied.
5. Leaf predicates are position-agnostic - `position` is display order only; the evaluator never reads it.
6. **Verification honesty:** `verify()` returns an outcome; the orchestrator stamps `tier` + `mechanism` from the contract constants. A verifier cannot upgrade its own tier by construction.

## File map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | 5 additive models + 8 enums (done, Phase A) |
| `prisma/sql/gate-engine-m1.sql` | Reviewed additive migration (done, Phase A) |
| `lib/gate-engine/types.ts` | GateDecision, NodeEvaluation, ConditionType contract, CarryForwardPolicy, VerifyOutcome, tree DTOs |
| `lib/gate-engine/registry.ts` | `defineCondition()` + `getCondition()` + `listConditions()`; open registry |
| `lib/gate-engine/validate.ts` | Authoring-time tree validation: single GROUP root, depth ceiling, group arity, registered types, config schemas |
| `lib/gate-engine/evaluate.ts` | Pure `evaluateTree(root, proofIndex, now)` - the recursion, written once |
| `lib/gate-engine/orchestrate.ts` | `evaluateGate()`, `verifyCondition()` - load workspace-scoped, carry-forward, passive verifiers, persist, call pure core |
| `lib/gate-engine/proofs.ts` | Proof upsert (unique nodeId+memberId), expiry computation, carry-forward query + copy-on-landing mint |
| `lib/gate-engine/growth.ts` | `recordGrowthEdge()` - workspace-scoped REFERRAL upsert |
| `lib/gate-engine/authoring.ts` | `createGate(workspaceId, resource, treeSpec)` test/authoring helper (validates then persists) |
| `lib/gate-engine/conditions/pay.ts` | Tier 1 / STRIPE_PAYMENT; injectable StripeIntentReader; replay defense |
| `lib/gate-engine/conditions/answer-questions.ts` | Tier 3 / AI_SCORING; wraps `scoreApplication()` read-only; needsHuman -> PENDING_REVIEW |
| `lib/gate-engine/conditions/referred-by-member.ts` | Tier 1 / INTERNAL_RECORD; reads `Member.referredByMemberId`; feedsGrowthGraph -> REFERRAL |
| `lib/gate-engine/conditions/attended-prior.ts` | Tier 1 / INTERNAL_RECORD; passive; counts checked-in RSVPs |
| `lib/gate-engine/conditions/hold-membership.ts` | Tier 1 / INTERNAL_RECORD; approved/status (+ optional tier list) |
| `lib/gate-engine/index.ts` | Public API surface; registers the 5 M1 conditions |
| `tests/unit/gate-engine/evaluate.test.ts` | Pure truth tables: every rule, required semantics, depth ceiling, fail-closed matrix |
| `tests/unit/gate-engine/validate.test.ts` | Authoring validation cases |
| `tests/unit/gate-engine/registry.test.ts` | "No verifier, no type" invariant walk |
| `tests/unit/gate-engine/conditions.test.ts` | Per-verifier unit tests (fake ports, no DB) |
| `tests/unit/gate-engine/acceptance.db.test.ts` | The six acceptance criteria on REAL seeded rows; env-gated `GATE_M1_DB_TESTS=1` so CI stays green |
| `scripts/seed-gate-m1.ts` | Deterministic seed: workspace, members, event, nested gate, checked-in RSVP history |
| `_context/17-access-gate-engine/CONTEXT.md` | Stage contract (created Phase A) |

**Naming note:** the frozen v1 engine (`lib/event-access.ts`) has a module-scoped TypeScript `Gate` type. No collision (different modules); any file importing both aliases explicitly (`import type { Gate as GateRecord } from "@prisma/client"`).

## Condition contract (normative shape)

```ts
export type CarryForwardPolicy =
  | { kind: "NEVER" }                    // PAY
  | { kind: "ALWAYS" }                   // ATTENDED_PRIOR, HOLD_MEMBERSHIP, REFERRED_BY_MEMBER
  | { kind: "MONTHS"; months: number };  // ANSWER_QUESTIONS: 12

export type VerifyOutcome =
  | { outcome: "SATISFIED"; payload?: Record<string, unknown> }
  | { outcome: "REJECTED"; reason: string; payload?: Record<string, unknown> }
  | { outcome: "PENDING_REVIEW"; reason: string; payload?: Record<string, unknown> };
// `reason` is internal/audit copy only - never rendered to a guest.

export interface ConditionType<C> {
  type: string;                          // registry key, e.g. "PAY"
  verificationTier: VerificationTier;    // stamped onto every proof
  proofMechanism: ProofMechanism;        // stamped onto every proof
  configSchema: z.ZodType<C>;
  guestPrompt: (config: C) => string;    // brand-law copy, no raw enums
  isPassive: boolean;                    // engine may verify without member action
  carryForward: CarryForwardPolicy;
  verify(args: {
    config: C;
    submission: unknown;
    member: Member;
    workspaceId: string;
    resource: { type: GateResourceType; id: string };
  }): Promise<VerifyOutcome>;
  feedsProfile?: (proof: GateProofRecord) => Record<string, unknown> | null;
  feedsGrowthGraph?: (proof: GateProofRecord, ctx: { workspaceId: string; memberId: string }) => GrowthEdgeWrite | null;
}
```

## The five verifiers

1. **PAY** (`{ priceCents: number; currency?: string }`): submission carries `paymentIntentId`; reader retrieves the intent; SATISFIED iff `status === "succeeded"`, `amount_received >= priceCents`, currency matches, AND the intent is traceable to this member (D11). Reads only - never touches charge/capture routes.
2. **ANSWER_QUESTIONS** (`{ minScore?: number; templateId?: string }`): submission carries `applicationId`; verifier checks the Application row is workspace-scoped to the gate and belongs to this member, then calls `scoreApplication(applicationId)` (read-only wrap of the frozen scorer). `needsHuman` -> PENDING_REVIEW; else score >= minScore (default: the workspace's existing approval threshold semantics, resolved in Phase B against how operators review scores today) -> SATISFIED / REJECTED. Payload: `{ score, archetype, needsHuman }`.
3. **REFERRED_BY_MEMBER** (`{}`): SATISFIED iff `member.referredByMemberId` is set and the referrer exists in the same workspace. `feedsGrowthGraph` returns a REFERRAL edge (referrer -> member).
4. **ATTENDED_PRIOR** (`{ minCount?: number }`, default 1): passive; SATISFIED iff the member's count of `RSVP { checkedIn: true }` rows in this workspace >= minCount.
5. **HOLD_MEMBERSHIP** (`{ tierIds?: string[] }`): SATISFIED iff `member.approved === true` and `status = MEMBER`-equivalent (exact status mapping resolved in Phase B against `MemberStatus`), and when `tierIds` present, the member's tier is in the list.

## Acceptance criteria -> test mapping (all on seeded rows, scratch/dev DB)

| # | Criterion | Test |
|---|---|---|
| 1 | Nested depth-2 gate "PAY AND (REFERRED_BY_MEMBER OR ANSWER_QUESTIONS)" opens only when genuinely satisfied; not-Open when a required child fails | `acceptance.db.test.ts` cases 1a-1d: payer+referred opens; payer alone (no branch) stays closed; referred alone (no payment) stays closed; both branches without PAY stays closed |
| 2 | Proofs persist with correct tier + proofMechanism per condition | case 2: after end-to-end satisfy, assert PAY proof = FIRST_PARTY/STRIPE_PAYMENT, ANSWER_QUESTIONS proof = AI_ATTESTED/AI_SCORING, REFERRED proof = FIRST_PARTY/INTERNAL_RECORD, row-level |
| 3 | `required: true` child blocks Open inside an ANY group when unsatisfied | case 3: ANY_N(1) group [required HOLD_MEMBERSHIP (unsatisfied), satisfied ATTENDED_PRIOR] evaluates closed; also covered in pure truth tables |
| 4 | Carry-forward pre-satisfies a returning member without re-verifying | case 4: member with a prior SATISFIED ATTENDED_PRIOR proof on event A lands on event B's gate -> node proof minted with `sourceProofId`, verifier spy NOT called; 13-month-old ANSWER_QUESTIONS proof does NOT carry; PAY never carries |
| 5 | REFERRAL GrowthEdge written when REFERRED_BY_MEMBER passes | case 5: edge row exists (workspace, REFERRAL, referrer, member), deduped on re-verify |
| 6 | Fail-closed: verifier error or ambiguous state is never Open | case 6: throwing verifier, Zod-invalid config, unregistered type, needsHuman pending - all evaluate not-Open; plus the pure-core fail-closed matrix |

## Phase B task sequence (TDD, commit per task)

Worktree conventions: symlinked `node_modules` + `.env.local`; verify with `node_modules/.bin/tsc --noEmit` + `node_modules/.bin/vitest run`; eslint direct on changed files; never `npm run build`; Prisma binary via `node node_modules/prisma/build/index.js`.

- [ ] **Task 0: Apply migration to CONFIRMED dev branch** - re-confirm `DIRECT_URL` host is `ep-sweet-term` (or the scratch branch Adam names), then `node node_modules/prisma/build/index.js db execute --file prisma/sql/gate-engine-m1.sql`, then `node node_modules/prisma/build/index.js generate`. Verify: `SELECT` from the five tables; confirm both DAM indexes still present (`Asset_searchVector_idx`, `Asset_embedding_hnsw_idx`).
- [ ] **Task 1: types.ts + registry.ts** - failing registry tests (register/get/unknown-type/duplicate-type) -> implement -> green -> commit.
- [ ] **Task 2: validate.ts** - failing validation tests (root must be GROUP; single root; depth ceiling flat+2; ANY_N arity; WEIGHTED threshold; empty group; unregistered type; bad config) -> implement -> green -> commit.
- [ ] **Task 3: evaluate.ts (pure core)** - failing truth-table tests first: ALL/ANY_N/WEIGHTED at depth 1 and 2, required-child override in every rule, expiry boundary (`expiresAt === now` is expired), missing proof, REJECTED/PENDING_REVIEW proofs, the full fail-closed matrix -> implement the recursion once -> green -> commit.
- [ ] **Task 4: proofs.ts** - failing tests: upsert honors (nodeId, memberId) unique; re-verify updates in place; expiry computed per policy (MONTHS from verifiedAt; ALWAYS/NEVER -> null); carry-forward query matches (workspaceId, memberId, conditionType, SATISFIED, unexpired); copy-on-landing keeps original expiresAt + sets sourceProofId; PAY skipped -> implement -> green -> commit.
- [ ] **Task 5: conditions (5 files) + growth.ts** - per-verifier unit tests with fake ports (fake StripeIntentReader, fake scorer boundary is the real `scoreApplication` signature) covering SATISFIED/REJECTED/PENDING_REVIEW/replay-defense/min-count/tier-list -> implement -> green -> commit. Registry invariant test: every registered type has a verifier with passing tests.
- [ ] **Task 6: orchestrate.ts + authoring.ts** - failing integration-shaped tests (mock db boundary): load workspace-scoped, passive verifiers auto-run, carry-forward invoked before evaluation, decision snapshot to GateSession, growth edge fired on SATISFIED referral -> implement -> green -> commit.
- [ ] **Task 7: seed + acceptance run** - `scripts/seed-gate-m1.ts` (deterministic, idempotent); `GATE_M1_DB_TESTS=1 node_modules/.bin/vitest run tests/unit/gate-engine/acceptance.db.test.ts` on the dev branch; all six criteria green on real rows -> commit.
- [ ] **Task 8: gates + closing** - `tsc --noEmit` exit 0; eslint clean on changed files; update `_context/17-access-gate-engine/CONTEXT.md` (closing checklist); final commit. NO merge, NO push, NO deploy.

## Hard constraints (restated)

Frozen zones untouched: `lib/scoring.ts` (wrapped, never edited), `MembershipForm.tsx`, `EventAccessFlow.tsx`, v1 gate engine internals (`lib/event-access*.ts`, `deriveFlow`, `buildSteps`), `config/archetypes.ts`, all Stripe payment routes. No UI. No cross-tenant reads. Additive schema only; `prisma db push` permanently banned; `npx` never. Brand law honored in every string the engine can emit (guestPrompt copy, log/DTO copy): "Access" not "RSVP", "No Bad Company" never "NBC", spaced hyphens, no raw enum values surfaced.
