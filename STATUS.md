# NoBC OS — Status

_Last updated: 2026-05-19_

## Current branch: `main`

## Last 5 commits
- `feat(events)` hero images, live RSVP list, member event redesign
- `feat(help)` operator + member help systems with tooltips
- `feat(member)` complete member portal — home, rsvps, profile
- `feat(dev)` AI persona runner + 50-batch seed
- `feat(workflows)` event workflow gates + editable tier names

## In flight
Validation hardening + bug audit. Uncommitted. `tsc --noEmit` clean.

## What shipped this session (uncommitted)

**Validation hardening**
- `lib/validation.ts` — strict email regex (rejects multi-@, missing TLD, whitespace), phone regex + `normalizePhone()`, `answersMap` for application drafts.
- `POST /api/apply/membership` — zod-validated (was unvalidated). Length-capped, phone-normalized on write.
- `PATCH /api/apply/membership/[id]` — zod-validated, gated to `status === PENDING`, validates id shape.
- `GET /api/apply/membership/[id]` — only PENDING drafts, internal AI fields stripped from response.
- Client inline validation + error display added to: WalkinModal (name/email/phone), ProfileForm (firstName/lastName/phone), EventAccessFlow GuestInfoStep (name/email), Comp drawer (email), Lists add form (email/phone). Submit buttons now disabled until form is valid.

**Phase 3 spot check**
- Sampled operator routes: workspace scoping correct (either `findFirst({id,workspaceId})` or `findUnique` + explicit workspaceId check).
- Public apply-draft endpoints were the main gap; now closed.

## Queued, awaiting prioritization
Three large task messages arrived mid-session:
1. **Delight pass** — MySpace theme readability, wax seal stamp animation, Velvet Rope theme, typewriter on Room vibe line.
2. **Theme audit + help rewrite** — full WCAG audit of all themes, NoBC-voice rewrite of operator + member help, Member Constellation viz, birthday wall, throwback widget, Clerk appearance config.
3. **5-block session** — design system primitives migration, OperatorComment + Notifications schema + UI, Cmd+K command palette, bulk actions on applications/members, single-source-of-truth counts API.

These overlap (themes appear in 1 & 2, help content in 2, dashboard widgets in 2, design primitives in 3). Needs direction before starting.

## Blocked
- Apple/Google Wallet passes — PassNinja account pending.
- MCP server toolset incomplete.
- Custom workflows (mix-and-match steps) — V2.

## Next session
Pick from the queue above, then smoke test in production:
1. Try POSTing `/api/apply/membership` with `email: "foo@@bar"` → expect 422.
2. Submit walk-in with malformed phone → expect inline "Enter a valid phone" before submit.
3. PATCH a non-PENDING application id → expect 403.
