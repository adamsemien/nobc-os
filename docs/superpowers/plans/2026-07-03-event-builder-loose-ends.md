# Event Builder Rebuild — Loose Ends (L) Build Contract

> **For agentic workers:** executed inline (session continuation, same worktree).
> Five named follow-ups from the rebuild + D6 + Night reports, closed on
> `feat/event-builder-rebuild` as one standalone commit. Adam's directive
> 2026-07-02 (four-phase apex, Phase 1).

**Goal:** Close the rebuild's own follow-ups: default gate on create, meter
grammar, per-event hero fit, series-scoped promo codes at gates, and commit
the v3 spec file.

**Architecture:** Everything rides existing seams — the open condition
registry, `Event.pageStyle` (jsonb), the D6 server-stamped discount path.
No schema changes.

---

## Decisions

**L1 — The default gate is a real OPEN condition, not an empty group.**
Adam's decision is DEFAULT GATE ON CREATE, described as "root GROUP, no
conditions = anyone can get in". The engine cannot honor that shape honestly:
`validateGateSpec` refuses childless groups and the FROZEN evaluator
fail-closes them (`EMPTY_GROUP`, evaluate.ts:76) — both locked M1 fail-closed
decisions that exist so a half-authored gate never admits by accident.
Weakening them would let an operator who deletes all conditions mid-edit
silently open a door. So the honest OPEN gate is a first-class condition
type: `OPEN` — passive (`isPassive: true`), carry-forward LIVE, tier
FIRST_PARTY, mechanism INTERNAL_RECORD, `verify()` always SATISFIED. The
canonical spec is `GROUP(ALL) → [CONDITION OPEN]` via `openGateSpec()`.
The orchestrator's existing passive pass auto-verifies it per evaluation
(HOLD_MEMBERSHIP's exact machinery), so the walkthrough evaluates Open with
zero guest friction beyond identity. Deviation from the directive's letter
(there IS one condition node); its substance holds: anyone gets in, v3 shape
only, rail and render agree.

**L2 — The rail's "open" draft kind maps to/from the OPEN spec.**
`draftFromTree`: a gate whose condition nodes are all OPEN → kind "open"
(sentence stays "Open - anyone can get in."). `draftToSpec(open)` →
`openGateSpec()` instead of null, and compose's `planToGateSpec` likewise —
no first-party caller sends null anymore. `setGateSpec(null)` keeps its
delete semantics for API compat. OPEN is NOT in the rail's addable chip
catalog; a mixed spec authored elsewhere degrades to the generic chip label.

**L3 — The anon DTO gains `gateOpen`; the open door says "Register".**
The anon assembly derives `gateOpen` = gate exists AND it has at least one
condition node AND every condition node is OPEN (fail-closed on the empty
case). RsvpCard: gated + open → CTA "Register" (copy law for open events);
gated + not open → "Unlock Access" unchanged. `/m` never sets either flag —
unchanged.

**L4 — Draft-create mints the gate; failure fails the create.**
`createEventDraft` creates the event then `engine.createGate` with
`openGateSpec()`. If the gate mint throws, the event row is best-effort
deleted and the action errors — a rebuild draft never exists gateless.
Compose gets the default via `createEventDraft`, then `setGateSpec`
replaces it with the composed spec (update path).

**L5 — Meter grammar.** `TemplateSplit.tsx` "Limited to N spots" pluralizes
on N. Sweep: RsvpCard's CapacityMeter and RoomDashboard already pluralize;
BuilderShell/EventOverviewTab strings carry no count. One fix site.

**L6 — `heroFit` rides `pageStyle` (jsonb), not a column.** The cutover
checklist sketched "additive column"; theme set the real precedent — page
knobs ride `Event.pageStyle` with zod-bounded parsing and zero DDL.
`heroFit: 'cover' | 'contain'` (default cover = pixel no-op). Rail control
next to the hero upload. All three templates' hero `<img>` read
`event.pageStyle.heroFit`; TemplateSplit keeps the `isActiveEvent` contain
hack ORed in until cutover step 10 retires it. Parity by construction: the
value flows through the one anon assembly.

**L7 — Series-scoped discount codes redeem at gates.** `checkDiscountCode`
gains `seriesId: string | null`; the lookup matches `eventId` OR (when the
event belongs to a series) `seriesId`, preferring the event-scoped code on a
code-string collision. The mint route reads `event.seriesId` from the select
it already makes and passes it through. Everything downstream (stamp,
verifier, claim, race treatment) is promo-id-scoped and unchanged. Comp
codes at gates stay event-scoped (unchanged surface, documented boundary).
Tier-scoped codes still refuse.

**L8 — The v3 spec file moves into the stage.** From the checkout root
(untracked) to `_context/17-access-gate-engine/`, byte-verified, committed.
The branch is self-documenting; the root copy is removed (content lives in
the shared git object store once committed).

## Acceptance

1. Fresh draft (engine path, same `openGateSpec()` the action uses) → anon
   preview DTO: `gated: true`, `gateOpen: true`, `eventAccess` null — and an
   identified guest session evaluates Open. A gateless event still reads
   `gated: false` (the old mismatch, pinned as the counterfactual).
2. OPEN condition truth table: always SATISFIED, passive, LIVE, honest
   tier/mechanism, strict empty config; `openGateSpec()` validates against
   the default registry.
3. Capacity 1 renders "Limited to 1 spot".
4. `heroFit` defaults pin (`cover`), merge preserves other pageStyle knobs.
5. Series code applies on an event in the series (route mint stamps it, line
   items and metadata correct); refused on an event outside the series and on
   an event with no series; concurrent last-use race on a series code admits
   exactly one.
6. tsc 0, eslint 0, full suite: only the 5 known pre-existing failures.
