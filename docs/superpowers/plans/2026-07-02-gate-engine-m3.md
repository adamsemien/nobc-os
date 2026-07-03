# Access Gate Engine v3 - Milestone 3: Builder

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The operator-side gate composition surface - a split-view Builder on the operator event page (compose the gate tree on the left, see the live guest render on the right), backed by STAFF-gated API routes and new engine authoring primitives (read / update / delete). Built on branch `feat/gate-engine-m3` (stacked on `feat/gate-engine-m2`), unmerged.

**Architecture:** The engine gains three authoring functions (`getGateForResource`, `updateGate`, `deleteGate`). `updateGate` is an **id-stable diff**, not a replace-all - nodes the operator kept (same id) are updated in place so their proofs survive; only removed nodes are deleted. The Builder UI is one client component rendered as a new "Access Gate" tab on the operator event detail page; its preview pane calls a validate-and-project endpoint that reuses `projectGuestView` (the M2 guest-safe projector) without persisting anything. Session minting + listing gives operators shareable `/gate/[token]` links and traversal visibility.

**Tech Stack:** Next.js 15 App Router, Prisma 7, Clerk (`requireRole` from `lib/operator-role.ts`), Zod, Vitest.

**Status:** In progress 2026-07-02.

> The v3 spec file is still not in the repo. M3 is designed end-to-end under Adam's standing design authority; reconcile against the spec's Builder sections when it lands. No money-path code in this milestone - the PAY condition renders as config + preview copy only (M3 constraint from Adam's directive).

---

## Files

| File | Responsibility |
|---|---|
| `lib/gate-engine/authoring.ts` | New engine authoring surface: `getGateForResource` (gate + materialized tree), `updateGate` (validated, id-stable diff in one transaction), `deleteGate` (cascade nodes + sessions; proofs detach with `conditionType` history intact). |
| `lib/gate-engine/orchestrate.ts` | `GateEngine` type + factory pick up the three authoring functions. `createGate` unchanged. |
| `lib/gate-engine/types.ts` | `GateNodeSpec` gains optional `id` (round-trip identity for the diff). Validation ignores it. |
| `app/api/operator/events/[id]/gate/route.ts` | GET (current gate + tree), PUT (create-or-update from spec), DELETE. Writes are `requireRole(STAFF)`. |
| `app/api/operator/events/[id]/gate/preview/route.ts` | POST: validate a draft spec, return `{ valid, errors, view }` where `view` is the anonymous guest projection. No writes. |
| `app/api/operator/events/[id]/gate/sessions/route.ts` | POST mint a `/gate/[token]` link (STAFF), GET list recent sessions with guest-state labels. |
| `app/operator/events/[id]/_components/GateBuilderTab.tsx` | The split-view Builder client component. |
| `app/operator/events/[id]/_components/EventTabs.tsx` | Add the "Access Gate" tab entry. |
| `app/operator/events/[id]/page.tsx` | Render the new tab. |
| `tests/unit/gate-engine/authoring.db.test.ts` | Env-gated DB acceptance: authoring round-trip, proof survival across edits, operator route handlers (with `lib/operator-role` mocked to the seeded operator), preview guest-safety, session mint + list, 403 on insufficient role. |

## Design decisions (standing authority - all flagged)

| # | Decision | Rationale |
|---|---|---|
| M3-D1 | `updateGate` is an id-stable diff, NOT delete-and-recreate | Replace-all would orphan every proof on the gate: a guest who already paid (PAY carries NEVER) would be asked to pay again after any cosmetic edit, and standing PENDING_REVIEW / REJECTED states would silently reset. Keeping node ids preserves proofs on untouched steps; removed steps genuinely lose their standing (correct - the operator deleted the requirement). |
| M3-D2 | A kept node id is honored only when workspace, gate, and `kind` all match | An id from another gate (or a kind morph CONDITION→GROUP) is treated as a new node - prevents cross-gate proof adoption and nonsense in-place mutations. |
| M3-D3 | Editing a kept node's config does not clear its proofs | The node is the same step, amended. A price rise does not invalidate tickets already bought at the asked price; verifiers check config at verification time, proofs are point-in-time truth. Flagged for the spec reconciliation - if §11.1 says config edits reset proofs, this is the conflict to review. |
| M3-D4 | Operator UI labels condition types with friendly copy ("Buy a ticket", "Submit an application", "Referred by a member", "Attended before", "Active member") - raw keys never render | Canonical-terminology law: no raw enum values in UI. The registry key stays the wire format. |
| M3-D5 | The Builder is a tab on the event detail page ("Access Gate"), not a standalone route | Operators live on the event page; the tab pattern (EventTabs) is the established surface. Split-view fits the full-width operator page convention. |
| M3-D6 | Preview endpoint validates + projects the DRAFT spec server-side and returns the same `GuestGateView` shape the guest page renders | One projector = zero drift between preview and reality, and the guest-safety guarantees (no enums, no reasons) hold in the preview by construction. |
| M3-D7 | Preview + session GET are read surfaces open to any resolved operator (repo convention: reads open, writes gated); PUT/DELETE/mint are `requireRole(STAFF)` | Matches the audited RBAC pattern for `/api/operator/*`. |
| M3-D8 | Operator API DB tests mock `lib/operator-role` (both role outcomes), not Clerk | `requireRole` is pre-existing audited infrastructure; `getMemberWorkspaceId` auto-creates workspaces via Clerk org resolution, which a test must never trigger. The handlers' contract - call the guard, scope by its workspaceId - is exactly what the mock exercises. |
| M3-D9 | Session list shows guest-state labels ("In progress", "On the list", "Expired"), never raw `GateSessionStatus` values | No raw enums in UI. |
| M3-D10 | `getGateForResource` returns the materialized `GateTreeNode` (ids included) rather than a bare spec | The Builder needs ids for the round-trip diff and the preview needs the same shape the projector eats. One shape, both uses. |

## Acceptance criteria

1. **Round-trip:** PUT a spec → GET returns the same tree (ids materialized) → PUT an edited spec (add a condition, keep the rest) → kept nodes keep their ids.
2. **Proof survival:** a SATISFIED proof on a kept node survives an edit that adds a sibling; the member's node still evaluates satisfied. A removed node's proofs detach (nodeId null) and the gate no longer grants through it.
3. **Validation is the same law:** an invalid draft (depth breach, empty group, unregistered type) is rejected by PUT with the validator's errors, and preview reports the same errors without persisting.
4. **Preview is guest-safe:** the preview view for all five M1 condition types contains no raw enum values, no reason codes, and brand-law copy only.
5. **RBAC:** PUT/DELETE/mint return 403 below STAFF; GET works for a resolved read-only operator.
6. **Sessions:** mint returns a working `/gate/[token]` URL (the M2 public GET serves it); the list reflects an identified traversal.

## Tasks

### Task 1: engine authoring additions
- [x] `types.ts`: optional `id` on both spec arms
- [x] `authoring.ts`: `getGateForResource`, `updateGate` (diff), `deleteGate`
- [x] wire into `GateEngine` + `index.ts` exports
### Task 2: operator API routes
- [x] `gate/route.ts` GET/PUT/DELETE
- [x] `gate/preview/route.ts` POST
- [x] `gate/sessions/route.ts` GET/POST
### Task 3: Builder UI
- [x] `GateBuilderTab.tsx` split-view composer + live preview + sessions panel
- [x] tab wiring (EventTabs + page.tsx)
### Task 4: tests + gates
- [x] `authoring.db.test.ts` acceptance (env-gated, ep-sweet-term)
- [x] tsc + eslint clean, full unit suite green
- [x] rendered-design screenshots for Adam
- [x] CONTEXT.md closing checklist + commit
