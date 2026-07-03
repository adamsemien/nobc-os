# Access Gate Engine v3 - Milestone 4: Cutover items (GO scope)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The three GO items from Adam's split-authority directive - the ANSWER_QUESTIONS application bridge, `/e/[slug]` gate-session minting, and per-token rate limiting - on branch `feat/gate-engine-m4` (stacked on `feat/gate-engine-m3`), unmerged. **The in-page PAY flow is PLAN-ONLY** - see `2026-07-02-gate-engine-m4-pay-plan.md`; no Stripe integration code exists on this branch.

**Architecture:** The bridge is a server-resolved action on the public token API - the guest clicks "check my application", the server finds their own application (never a client-supplied id) and feeds it to the existing verifier. `/e/` minting forks ONE branch of `RsvpCard` (the shared access-card slot, not frozen): when the event carries a gate, the idle CTA becomes a form POST to a mint-and-redirect route; EventAccessFlow is not mounted and not modified. Rate limiting is an in-memory sliding window applied to every public gate surface.

**Tech Stack:** Next.js 15 App Router, Prisma 7, Zod, Vitest.

**Status:** In progress 2026-07-02.

---

## Files

| File | Responsibility |
|---|---|
| `lib/rate-limit.ts` | Dependency-free sliding-window limiter (`createRateLimiter`) + `clientIpFrom(req)` helper. |
| `lib/gate-engine/application-bridge.ts` | `findApplicationForMember` - the member's latest application in the workspace (by memberId or case-insensitive email). Server-side only. |
| `lib/gate-engine/guest-view.ts` | `GuestStepView.action` (`"apply" | null`) - the projector marks ANSWER_QUESTIONS steps still needing action so the page can offer the bridge. |
| `app/api/gate/[token]/route.ts` | New `check_application` action + rate limits on GET/POST. Guest-safe notice copy when no application is found. |
| `app/gate/[token]/_components/StepActions.tsx` | "Apply to attend" link + "I have applied - check it" button per apply step. |
| `app/gate/[token]/page.tsx` | Renders StepActions for steps with `action: "apply"` on identified sessions. |
| `app/m/events/[slug]/_components/EventDetail.tsx` | `EventDetailDTO.gated?: boolean` (optional - member surface never sets it). |
| `lib/public-event-loader.ts` | Populates `gated` on the public DTO when a Gate row exists for the event. |
| `app/m/events/[slug]/_components/RsvpCard.tsx` | Gated fork of the idle CTA (inline + mobile sticky): form POST to the mint route; EventAccessFlow not mounted when gated. All ungated behavior byte-identical. |
| `app/e/[slug]/access/route.ts` | POST: resolve published event -> gate -> rate limit -> mint GateSession -> 303 to `/gate/[token]`. GET: redirect back to the event page (no side effects on GET). |
| `tests/unit/gate-engine/rate-limit.test.ts` | Limiter truth table (window slide, per-key isolation, prune). |
| `tests/unit/gate-engine/m4-flows.db.test.ts` | Env-gated: bridge end-to-end on real rows (fake scorer via module mock), no-application notice, mint redirect + working token, GET-no-mint, unknown-slug 404, mint rate limit 429. |

## Design decisions (standing authority - all flagged)

| # | Decision | Rationale |
|---|---|---|
| M4-D1 | The bridge action is `check_application` with NO client-supplied application id - the server resolves the identified member's own application | A capability token must never let a guest submit someone else's application id. The verifier's ownership check remains as defense in depth. |
| M4-D2 | The bridge finds the LATEST application by (memberId OR case-insensitive email) in the workspace | Mirrors the verifier's own ownership rule; latest-wins matches how re-applications work. |
| M4-D3 | `GuestStepView.action` is a designed union (`"apply"`), not the condition type | The projector's no-raw-enums guarantee holds; the page never learns registry keys. PAY gets no action in M4 (plan-only). |
| M4-D4 | Gated events fork ONLY the public `/e` surface; `/m` member pages are untouched (loader never sets `gated`) | Members are signed in - routing them through an anonymous token flow is cutover-final design, not an M4 side effect. One documented boundary. |
| M4-D5 | The fork lives in `RsvpCard`; `EventAccessFlow` is not mounted for gated events and is NOT edited | RsvpCard is the access-card slot and is not in the frozen zone; the frozen flow component stays byte-identical. Gates can only exist via the unmerged M3 Builder, so no live event's behavior changes on merge until an operator builds a gate. |
| M4-D5b | A gate owns EVERY pre-engagement state of the card (idle, closed-to-viewer, at-capacity), not just the idle CTA; the card header reads "Event Access" instead of the v1 access-type label | The gate replaces the v1 door policy - a gated event whose v1 config says "members only" must show the gate, not "Closed" (surfaced by the rendered capture: the default v1 config closed the door to anonymous guests and hid the gate entirely). Confirmed/pending/waitlisted states still render - they reflect real reservations. Capacity semantics inside gates are v3-future work. |
| M4-D6 | Gated CTA copy is "Unlock Access" with the sub-line "A few steps unlock your access" | The locked CTA list maps to v1 access modes; a composite gate is none of them. New member-facing copy - explicitly for Adam's review in the rendered capture. |
| M4-D7 | Minting is POST-only (a plain form, no JS); GET on the mint route redirects to the event page | Crawlers and link prefetchers GET - they must never create sessions. A form POST keeps the flow JS-free and side-effect-correct. |
| M4-D8 | Rate limiting is in-memory per serverless instance: gate GET 60/min per token+IP, gate POST 12/min per token+IP, mint 10/min per IP | Abuse damping without a new dependency (no Upstash/Redis). Per-instance windows are weaker than a shared store - documented as the M4 baseline; a shared store is a one-file swap later. POST is tighter because submit triggers verifiers (including AI scoring). |
| M4-D9 | Rate-limit responses are guest-safe 429s with Retry-After and the same copy shape as other gate errors | The public surface never leaks internals, including under abuse. |
| M4-D10 | The bridge returns a guest-safe `notice` string alongside the view when no application exists yet | The guest needs one actionable sentence; decline-privacy still holds (no reasons for rejected applications). |

## Acceptance criteria

1. **Bridge happy path:** an identified guest with a real (scorable) application clicks check -> the ANSWER_QUESTIONS node gains a SATISFIED proof and the view reflects it. Fake scorer injected at the module boundary - no live AI call in tests.
2. **Bridge empty path:** no application -> guest-safe notice, node stays unproven, nothing persisted.
3. **Mint path:** POST `/e/[slug]/access` for a gated published event 303s to `/gate/[token]` and that token serves the walkthrough; GET mints nothing; unknown/unpublished slug 404s.
4. **Ungated invariance:** an event without a gate never redirects - the DTO's `gated` flag stays falsy and RsvpCard renders exactly the v1 CTA.
5. **Rate limits:** limiter unit truth table green; the mint route returns 429 after the per-IP budget with Retry-After set.
6. **No PAY integration code** anywhere on the branch - grep-verifiable (no Stripe imports outside existing frozen routes + the M1 read-only verifier).

## Tasks

- [x] `lib/rate-limit.ts` + unit tests
- [x] projector `action` field + application-bridge helper + `check_application` route action
- [x] StepActions UI + page wiring
- [x] DTO `gated` + public loader population + RsvpCard fork + `/e/[slug]/access` route
- [x] rate limits on gate GET/POST + mint
- [x] `m4-flows.db.test.ts` acceptance on ep-sweet-term
- [x] PAY plan doc (plan-only, separate file)
- [x] tsc + eslint + full suite green; rendered capture; CONTEXT.md checklist; commit
