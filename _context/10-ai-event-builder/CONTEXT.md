# Stage 10 — AI Event Builder

> Natural-language event creation. The operator describes an event in plain English;
> the composer extracts a typed plan, asks ONLY for missing core fields, shows a
> plain-English confirm screen, and creates the draft — through the same builder
> action layer the UI uses — only after the operator explicitly confirms.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped on `main` (compose, Phase E of the event-builder rebuild, `ecf1d07` 2026-07-03) + 🟡 confirm-before-create restructure built on `ai-event-creation`, unmerged |
| **V1 item** | #19 |
| **Last updated** | 2026-07-12 |
| **Owner** | Adam |
| **Blocked on** | Adam: review + merge `ai-event-creation` (gap-fill + confirm gate + multi-entry-point build) |
| **Next** | Adam reviews + merges `ai-event-creation`, then live-tests the four entry points (dashboard compose box, `/operator/events/new`, the builder's "Compose new event" slide-over, Cmd+K "Create event"). Next build after that (explicitly out of this one's scope): NL-EDIT an existing event, and URL/Luma-link import. |

> **Doc history.** An earlier version of this file described a `feat/ai-event-builder`
> branch (single `generateObject` at `app/api/agent/event-builder/route.ts`, hardcoded
> `claude-sonnet-4-20250514`, review via the old `/operator/events/new` multi-step
> wizard, commits via `POST /api/operator/events`). That branch was superseded and its
> route deleted; the model it pinned was retired (404s), its `EventDraft` schema could
> not express "$25 OR apply", and both its review surface (the wizard) and its write
> path (`POST /api/operator/events`, now deprecated/410) are gone. The real, live
> implementation is `lib/builder/compose.ts` — documented below.

## The real implementation (as of 2026-07-12)

**Extraction spine** — `lib/builder/compose.ts` (shipped `ecf1d07`, Phase E):
- `planSchema` + one `generateObject` call on `JUDGMENT_MODEL` (locked two-tier
  policy) turns the operator's sentence into a typed `CompositionPlan` — title,
  description, startAt, location, capacity, `requiredAll[]` (AND), `anyOneOf[]` (OR),
  serviceFeeMode, compCode, `assumptions[]`.
- `planToGateSpec()` compiles the plan into a Gate-engine `GateNodeSpec`:
  `anyOneOf` → `GROUP(rule: ANY_N, requiredCount: 1)` — "$25 OR apply" is
  `[{kind:'pay', priceCents:2500}, {kind:'apply'}]`.
- Execution goes EXCLUSIVELY through `lib/builder/actions.ts` (`createEventDraft` →
  `updateEventDetails` → `setGateSpec` → optional `setServiceFee`/`createCompCode`).
  The model writes nothing directly and structurally cannot publish (publishEvent
  demands a `confirm: true` the composer never passes) or touch Stripe.

**Confirm-before-create + gap-fill** (branch `ai-event-creation`, 2026-07-12):
- `proposeComposition(prompt, {clarifications})` — extraction ONLY, zero persistence.
  Returns the plan, missing-core-field questions, and a plain-English access readout.
  Injects today's date (America/Chicago) so "next Sunday" resolves; normalizes model
  datetimes to the Z-form the action layer's zod accepts.
- Core fields that prompt a question (locked decision): start date/time; end
  date/time ONLY when the prompt implies an end; location; access model ONLY when
  ambiguous. Capacity/description/hero/fee never prompt — silent defaults, editable
  later. End-time + access-ambiguity detection ride a sidecar `generateObject` call
  (`gapProbeSchema`) because `planSchema` is frozen; the probe degrades gracefully.
- Answers are re-extracted server-side as clarifications appended to the prompt —
  never client-patched. A field is asked at most once.
- `executeComposition(plan, {endAt})` runs ONLY from `confirmComposeAction` after the
  operator's explicit confirm. The confirm screen renders the access model in plain
  English (`accessReadout()` — e.g. "Any one way in: pay $25, or apply for
  consideration."), never spec JSON.
- The old one-shot client seam (`composeEventAction`) is gone; `composeEventFromPrompt`
  remains as the programmatic/test seam only.

## Entry points (one shared engine, four surfaces)

| Surface | File | How |
|---|---|---|
| Dashboard compose box | `app/operator/_components/ComposeEventBox.tsx` | wraps the shared flow |
| New-event page (primary path) | `app/operator/events/new/page.tsx` | flow embedded; "name it and go" kept as fallback |
| Inside the builder | `app/operator/events/[id]/builder/BuilderShell.tsx` | "Compose new event" slide-over |
| Cmd+K "Create event" | `lib/commands/action/create-event.ts` | routes to `/operator/events/new` |

All four mount `app/operator/_components/ComposeEventFlow.tsx` and call the same two
server actions in `lib/builder/compose-action.ts` (`proposeEventAction`,
`confirmComposeAction`), both STAFF-gated.

## Files in play

```
lib/builder/compose.ts                       ← extraction (planSchema), gap probe, core-gap detection, accessReadout, propose/execute split
lib/builder/compose-action.ts                ← the client seam: proposeEventAction + confirmComposeAction (STAFF-gated; no one-shot create)
app/operator/_components/ComposeEventFlow.tsx ← the shared flow UI (prompt → questions → confirm → create)
app/operator/_components/ComposeEventBox.tsx  ← dashboard card wrapper
app/operator/events/new/page.tsx              ← compose primary + title fallback
app/operator/events/[id]/builder/BuilderShell.tsx ← in-builder slide-over trigger
lib/commands/action/create-event.ts           ← Cmd+K entry (routes to events/new)
tests/unit/builder/compose-flow.test.ts       ← confirm-gate proof, gap matrix, readout copy, execution order
tests/unit/compose-event.db.test.ts           ← Phase E acceptance on real rows (env-gated)

# Deprecated by this stage's history:
# app/api/agent/event-builder/route.ts   (deleted — superseded v1)
# POST /api/operator/events              (inert 410 — wrote the pre-rebuild access shape)
```

## Rules — DO NOT VIOLATE

1. **Nothing is created before operator confirm.** `proposeComposition` must stay
   write-free; every create runs through `confirmComposeAction` after an explicit
   operator confirm. No auto-publish path exists and none may be added — publish
   keeps its own separate `confirm: true` gate in the builder.
2. **All writes go through `lib/builder/actions.ts`.** The model registers no tools
   and never touches the DB, Stripe, or publish. The composer may never gain a
   capability the manual builder UI lacks.
3. **The confirm screen renders the access model in plain English** — never raw
   `GateNodeSpec` JSON, never raw enum values. Copy law applies ("Access" never
   "RSVP"; spaced hyphens, never em dashes).
4. **Core-field questions only.** Start, implied end, location, ambiguous access.
   Non-core fields (capacity, description, hero, fee) must never prompt.
5. **`planSchema` and `planToGateSpec` are the frozen extraction/compile spine.**
   New signals ride sidecar calls (the gap probe pattern), not schema edits.
6. **Workspace-scoped throughout** — inherited from the action layer's STAFF gate.

## What this stage does NOT own

- Event schema + the events table → `03-events/`
- The Gate engine internals → `17-access-gate-engine/` (called via `setGateSpec` only)
- The Phase J webhook send → `11-producer-integration/`
- General-purpose AI chat → `09-ai-chat/` (`lib/agent/` has NO event-write tools — by
  decision, the compose flow's Q&A is dedicated, not agent-loop based)
- NL-editing an existing event / URL import → next build, explicitly out of scope here
