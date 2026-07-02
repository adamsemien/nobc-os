# Access Gate Engine v3 - Milestone 2: Guest Render

**Goal:** The guest-facing render of a gate - a token-addressed, anonymous-capable walkthrough that turns M1 engine state into an on-brand, guest-safe surface. Built on branch `feat/gate-engine-m2` (stacked on `feat/gate-engine-m1`), unmerged.

**Status:** Built and verified 2026-07-01. All gates green (tsc 0, eslint 0, 80 unit + 11 DB acceptance tests). Rendered design captured for Adam's review (anonymous + open states).

> The v3 spec file is still not in the repo. M2 was designed end-to-end under Adam's standing design authority; reconcile against the spec's guest-render sections when it lands.

---

## What shipped

| File | Responsibility |
|---|---|
| `lib/gate-engine/guest-view.ts` | The ONLY engine-state -> guest-shape layer. Hard guarantees: no enum values, no reason codes, no decline reasons, brand-law copy only, fail-closed to `{available:false}`. |
| `lib/gate-engine/guest-session.ts` | Token capability surface: load (expiry + workspace checks), identify (calls the FROZEN `findOrCreateGuestMember`, never edits it; identified sessions are immutable), view assembly through the engine. |
| `app/api/gate/[token]/route.ts` | Public GET (view) + POST (`identify` / `submit`). Guest-safe errors, verifier internals never leak, 404 on unknown/expired tokens. |
| `app/gate/[token]/page.tsx` | Server-rendered walkthrough: cream paper, PP Editorial italic headline, section cards per group with state chips (Done / To do / In review / Required). |
| `app/gate/[token]/_components/IdentifyForm.tsx` | The one client component: name + email -> identify -> refresh (carry-forward and passive verifications land immediately). |
| `tests/unit/gate-engine/guest-view.test.ts` | Projector truth tables + the brand-law sweep over every emitted string from all five real condition types. |
| `tests/unit/gate-engine/guest-flow.db.test.ts` | Env-gated, real route handlers on real rows: anonymous view, identify-attaches-existing-member (frozen helper, no duplicate row), passive referral opens the gate, session immutability, expired/unknown token 404s, pre-identity submit 409, malformed body 400. |

## Design decisions (standing authority - all flagged)

| # | Decision | Rationale |
|---|---|---|
| M2-D1 | Standalone token surface `/gate/[token]` + `/api/gate/[token]`, NOT an edit of `/e/[slug]` | The live event door stays untouched until the M4 backfill/cutover; a GateSession token is the natural guest capability and needs no Clerk session. |
| M2-D2 | PAY and ANSWER_QUESTIONS render state + prompt only in M2; their in-page flows (Stripe Element, application bridge) are M4 work | Both would create new money/apply surfaces - that deserves its own explicit gate with Adam, not a side effect of the render milestone. The submit API already accepts their submissions programmatically. |
| M2-D3 | Guests never see WHY a step was declined - REJECTED renders as "To do", PENDING_REVIEW as "In review" | Operator surfaces get reasons; guests get state. Matches the platform's decline-privacy stance. |
| M2-D4 | Identified sessions are immutable (second identify keeps the original member) | A capability token must not allow member swapping mid-traversal (proof hijacking). |
| M2-D5 | Group headlines are intuitive copy ("Complete all of these", "Complete any one of these", "Complete enough of these") | ANY_N / WEIGHTED are operator mechanics; guests get plain language, weights never render. |
| M2-D6 | The projector fails closed to an "Access is not available right now" page on ANY unprojectable state (unregistered type, structural violation, unknown token) | Same fail-closed law as the engine, at the render layer. |
| M2-D7 | Public routes ride the repo's default-public middleware; the token is the credential | Consistent with `/e/` and `/apply`. Per-token rate limiting is listed for M4 hardening, not silently skipped. |
| M2-D8 | Test worlds are slug-parameterized (one workspace per suite) | Parallel vitest files must not race on shared seeded state. |

## Verification (2026-07-01)

- `tsc --noEmit` exit 0; `eslint` exit 0 on all M2 files.
- Unit: 80 passed (7 new projector tests incl. the brand-law sweep).
- DB acceptance (`GATE_M1_DB_TESTS=1`, ep-sweet-term): 11 passed - M1's six criteria still green after M2, plus the five guest-flow route tests.
- Rendered design: dev server booted in the worktree, both states screenshotted (anonymous walkthrough with identify card; open "You're on the list" with an In-review step) and sent to Adam. All seeded worlds cleaned from dev afterward.

## Deferred to M4 (cutover) - explicitly, not silently

- In-page PAY flow (payment-intent creation + Stripe Element) and the application bridge for ANSWER_QUESTIONS.
- `/e/[slug]` integration: gated events mint GateSessions and route guests to the walkthrough.
- Per-token rate limiting + abuse hardening on the public API.
- Operator-side session/proof visibility (M3 Builder territory).
