# NoBC OS — Claude Code Reference (L0 Router)

## What This Is

NoBC OS is the member-facing platform for No Bad Company — a premium curated member club and event operator. Part of a three-layer stack alongside Producer (operator-facing, on Replit) and a Runtype + Tenur AI layer.

**Tenant Zero is NoBC.** Built multi-tenant from day one to sell as SaaS to other premium member clubs (Soho House-tier target).

---

## How to use this file

This is the **L0 router**. For any task, identify the stage in `_context/` and tell Claude Code where to work:

> "Work in `_context/03-events/`. Add the custom question builder."

Claude Code then loads only that stage's `CONTEXT.md` plus the rules in this file.

Stage map: see `_context/README.md`.
Methodology: see the `nobc-icm` skill.

---

## Stack (always-loaded)

- **Framework:** Next.js 15, App Router, TypeScript, Tailwind CSS
- **DB:** Postgres on Neon + Prisma 7
- **Auth:** Clerk with Organizations (org = workspace = tenant)
- **Email:** Resend (transactional only)
- **Payments:** Stripe (authorize/capture)
- **AI:** `claude-sonnet-4-20250514` via Vercel AI SDK (the locked model — see Locked Decisions)
- **Agent runtime:** Runtype (V1.5)
- **Deploy:** Vercel
- **Testing:** Vitest (unit) + Playwright (E2E). Unit harness added 2026-05-22 (`npm run test:unit`).

---

## Current Build State

**As of 2026-05-25 — V1 is functionally complete.**
17/20 V1 items are DONE in code. 2 are PARTIAL (credentials only, not code). 0 are NOT STARTED.
A May-2026 session added the House Phone SMS inbox, the member-QR rollout, the editorial event-page redesign, operator roles, and the House Phone Intelligence tab — see "What shipped beyond V1 scope" below.

### V1 scope status (items 1–20)

> Status reflects the code-verified inventory in `_context/GROUND_TRUTH.md`.

| # | Feature | Status |
|---|---|---|
| 1 | Membership application form (`/apply`) | ✅ DONE |
| 2 | Multi-tenant Postgres schema (Prisma) | ✅ DONE |
| 3 | Clerk auth + Organizations (org = workspace) | ✅ DONE |
| 4 | Approval workflow → welcome email | ✅ DONE |
| 5 | AI archetype scoring | ✅ DONE |
| 6 | Member event calendar + detail | ✅ DONE |
| 7 | Event Access submission | ✅ DONE |
| 8 | Approval-required access handling | ✅ DONE |
| 9 | Stripe payments (authorize/capture) | ✅ DONE |
| 10 | Operator refunds | ✅ DONE |
| 11 | Wallet passes (Apple/Google via PassNinja) | ⚠️ PARTIAL — code complete, `PASSNINJA_*` keys unset in Vercel |
| 12 | Offline check-in PWA | ✅ DONE |
| 13 | Custom question builder / registration fields | ✅ DONE |
| 14 | Capacity + waitlist (auto-promote) | ✅ DONE |
| 15 | Plus-ones | ✅ DONE |
| 16 | Red List / duplicate handling | ✅ DONE |
| 17 | NoBC OS MCP server | ✅ DONE |
| 18 | Operator AI chat panel | ✅ DONE |
| 19 | AI Event Builder | ✅ DONE |
| 20 | Audit events + Svix outbound | ⚠️ PARTIAL — audit DONE, Svix code complete but `SVIX_API_KEY` unset |

### Remaining before full V1 launch

- Set `PASSNINJA_API_KEY` + `PASSNINJA_ACCOUNT_ID` + `PASSNINJA_PASS_TYPE` in Vercel (wallet passes go live)
- Set `SVIX_API_KEY` in Vercel (outbound webhooks go live)
- Verify application review QA bugs — could not reproduce in code, needs live confirmation
- Operator RBAC coverage is essentially complete — every `/api/operator/*` write, `/api/stripe/refund`, `/api/agent/*`, and `/api/intelligence/{compose,reports}` are `requireRole`-gated, and a Clerk-org floor keeps org admins from being locked out. Only the `/api/mcp` write path remains ungated (it uses `Bearer` auth — needs its own design). (House Phone `/api/sms/*` is intentionally Clerk-org-membership-gated and `/api/check-in/*` uses `CHECKIN_SECRET` — both by design. See Roles & Permissions.)
- Set `TWILIO_*` + `HOUSE_PHONE_WORKSPACE_ID` in Vercel and deploy the Railway inbound service to take House Phone live end-to-end

### What shipped beyond V1 scope (already live)

- Comp tickets, 7-theme white-label system, hero images, bulk delete, compliance pages
- Producer Phase J webhook integration
- Intelligence system, ticketing V2/tiers, event series, lists, comments, notifications
- Cmd+K palette, event room/vibe, model switcher
- Internal QA/persona/seed dev tooling

**May-2026 session (PRs #4 / #5 / #6 open at time of writing — documented here ahead of merge; #1–#3 already merged to main):**
- **House Phone** — shared multi-operator SMS inbox. Outbound replies + inbox UI in nobc-os (`/api/sms/*`, `/operator/house-phone`); inbound on a separate Railway service (`nobc-house-phone`). Stage 14.
- **Member QR rollout** — `lib/member-qr.ts` `generateMemberQrCode()` is now the single mint path for every production Member-creation route, so non-member ticket buyers get a scannable QR (fixes the paid-purchase email + door scan). Stages 02/05/06.
- **Operator RSVP bypass + guest-flow fix** — signed-in non-members can complete the guest flow; operators can bypass the access flow (free + paid) and preview it. Stage 04.
- **Event-page editorial redesign** — all three member event-detail templates (Split, Editorial, Minimal), cream paper tokens, warm access copy, hero **upload** in event settings. Stage 03. (PR #3, merged to main.)
- **Operator roles** — `OperatorRole` (ADMIN/STAFF/READ_ONLY) + `WorkspaceMember` + `lib/operator-role.ts`, Team settings UI. Stage 07. (PR #5.)
- **House Phone Intelligence tab** — `GET /api/sms/analytics` + `GET /api/sms/categorize` + `SmsMessage.category`, surfaced in the Intelligence dashboard. Stages 12/14. (PR #6.)
- **Vitest unit harness** + `toScoreDisplay` tests. Stage 13.
- **Add Member (manual member creation)** — `POST /api/operator/members/create` + Add Member slide-over. **In progress — PR #4 open, NOT yet merged.** Stage 07.

---

## Locked Decisions (NEVER override)

These are hard constants. Any agent that violates them is broken.

- **Email `from` address:** `team@thenobadcompany.com` — always, every transactional email, every welcome, every notification
- **AI model:** `claude-sonnet-4-20250514` — every Anthropic call. Do not substitute a different model, do not "upgrade" to a newer version, do not swap to a cheaper one. Adam decides model bumps explicitly.
  - **Authorized Haiku exceptions** (`claude-haiku-4-5-20251001`) — explicit, Adam-authorized uses for cheap, high-volume or non-critical editorial summarization. These do NOT relax the lock anywhere else; any other model choice still requires Adam's sign-off:
    1. **House Phone SMS** — inbound triage (the Railway service) and SMS topic categorization (`GET /api/sms/categorize`). Cheap high-volume SMS classification.
    2. **Sponsor Intelligence narrative** — the Sentiment & Alignment narrative on `/operator/intelligence/sponsor` (`app/operator/intelligence/sponsor/actions.ts`). Authorized 2026-05-25 for editorial sponsor-briefing summarization.
- **Never modify legal copy** in /apply screen 7 (waiver). Pending attorney review. Any change requires Adam's explicit sign-off.
- **Never break /apply, archetype config (config/archetypes.ts), or the AI scoring system.** These are shipped and live. Changes require explicit task authorization.

---

## Canonical Terminology (UI copy law)

Product language is locked. Do NOT improvise. Do NOT use synonyms.

- The user-facing concept is **"Access" / "Event Access"** — NEVER "RSVP" in operator UI or member-facing copy. (RSVP is acceptable only in internal code/schema names where the table is already named RSVP.)
- Three access groups: **Member Access, Guest Access, Comp Access**
- Member-facing CTA copy depending on access mode:
  - Open events: "Register"
  - Apply-required events: "Apply to Attend"
  - Ticketed events: "Get Ticket — $X"
  - Confirmation state: "Reserve My Spot" → "You're on the list"
- **Never expose raw enum values in UI** — `apply_or_pay`, `OPEN`, `MemberStatus.GUEST` must always be mapped to display strings
- "Non-member ticket buyer" displays as **Guest** (where MemberStatus=GUEST)
- "Custom questions" displays as **"Registration fields"** in operator UI

When writing any UI copy, audit against this list. If a label doesn't match, fix it before shipping.

---

## Roles & Permissions

Operator access is role-gated per workspace. The shipped model (2026-05-25, PR #5) is **three roles**, stored on `WorkspaceMember.role` (`OperatorRole` enum) and enforced server-side via `lib/operator-role.ts`:

- **ADMIN** — full access (workspace settings, team management, billing surfaces).
- **STAFF** — operational access (approvals, create/publish events, comps, check-in). Default for a new `WorkspaceMember`.
- **READ_ONLY** — view-only, no writes. Also the floor for a plain (non-admin) Clerk-org member with no explicit `WorkspaceMember` row, so adding a gate never hard-locks an existing org member out of read surfaces.

Hierarchy: `ADMIN > STAFF > READ_ONLY`. Guards: `requireRole(minRole)` (route handlers → 401/403), `requireRolePage(minRole)` (server components → redirect), plus `getEffectiveRole` / `getOperatorRole` / `isAdmin` / `isStaff`.

**Effective role** (`getEffectiveRole`, used by every guard) = the higher of any explicit `WorkspaceMember` grant and a **Clerk-org floor** — Clerk org admin → ADMIN, plain Clerk org member → READ_ONLY. A Clerk org admin is therefore never locked out of their own workspace even with no `WorkspaceMember` row, and explicit STAFF/ADMIN grants still elevate a plain member (fixed 2026-05-26 — this `WorkspaceMember`-vs-Clerk drift had hidden the Sponsors nav and could 403 legitimate admins; same class as the House Phone fix). `getOperatorRole` stays the pure `WorkspaceMember` lookup.

Rules:
1. UI hide/disable is UX only; the `requireRole` check is the real security boundary.
2. **Coverage (audited 2026-05-26).** `requireRole` gates **every `/api/operator/*` write** — STAFF for operational writes (applications approve/reject/hold/waitlist, events CRUD + comp + promote-waitlist + bulk-delete, rsvps approve/cancel/reject, tiers, series, comments, lists, notifications, members/create), ADMIN for sensitive ones (settings/*, team/*, members/bulk) — plus `/api/stripe/refund` (ADMIN), the `requireRolePage(ADMIN)` settings pages, and `/api/agent/*` + `/api/intelligence/{compose,reports}` POST (STAFF). **Still ungated:** the `/api/mcp` write path (external clients authenticate via `Bearer`, not a Clerk session — needs its own design) and `/api/check-in/*` (intentionally on a `CHECKIN_SECRET` bearer, not a Clerk session). GET/read routes stay open to any resolved member.
3. **House Phone (`/api/sms/*`) is intentionally NOT `requireRole`-gated.** It authorizes by Clerk org membership (`auth()` + `getMemberWorkspaceId`): any member of the resolved workspace's Clerk org may view + reply + toggle AI; no `WorkspaceMember` row required. Fixed 2026-05-26 — `requireRole(STAFF)` had drifted onto three of the routes (`/api/sms/conversations`, `/reply`, `/conversation/[id]`) and 403'd a legitimate Clerk org admin who had no `WorkspaceMember` row, blanking the inbox. Clerk org membership is the single source of truth for this shared live-event tool (avoids `WorkspaceMember`-vs-Clerk drift); workspace scoping on the data is unchanged.

> An earlier draft of this section described five roles (owner/admin/manager/staff/readonly) "enforced on every route." That was aspirational and never built — the three roles above are what shipped. Update this section, not your memory, if the model changes.

---

## Architecture (load-bearing detail)

```
Producer (Replit) ←Phase J HMAC webhook→ NoBC OS (Vercel)
       │                                       │
       └──── Both connect to ────────→ Postgres (Neon)
                  same instance

NoBC OS → Runtype Master Agent → House Phone → Twilio
                                  (sub-agent)
```

**Critical:** Producer and NoBC OS share the SAME Postgres instance. This is why schema changes are production-affecting and must NEVER auto-push — they could break Producer.

Phase J details:
- HMAC-SHA256 with shared secret
- Header: `X-NoBC-Signature`
- Fire-and-forget pattern, one retry, queue on failure
- Env vars: `PRODUCER_WEBHOOK_URL`, `PRODUCER_WEBHOOK_SECRET`

**House Phone (the shared SMS inbox) is shipped in two halves on the same Postgres:** **inbound** SMS runs on a separate Railway service (`nobc-house-phone`, its own repo — Twilio webhook receipt, signature validation, contact lookup, AI auto-reply) that writes `SmsConversation`/`SmsMessage`; **outbound** replies + the operator inbox UI live in nobc-os (`/api/sms/*`, `/operator/house-phone`). This is a different thing from the Runtype "House Phone" sub-agent in the diagram above (same name). See `_context/14-house-phone`.

---

## Absolute Rules (apply to every stage)

### Twilio — House Phone SMS only
Twilio is approved for the House Phone SMS feature only (`lib/twilio.ts` + `/api/sms/reply`). Do not add Twilio to any other feature without explicit approval.

### Workspace scoping is the security boundary
Every read and every write is workspace-scoped. `workspaceId` is on every user-data table, indexed, and checked on every query. No exceptions.

### No hex literals in components
All colors are CSS variables. Semantic tokens only: `bg-primary`, `text-text-primary`. The theme system supports white-labeling for multi-tenant SaaS.

### Schema changes: generate then push manually
Run `prisma generate` first. Show the diff. Never auto-push. Producer is on the same Postgres instance — schema changes are production-affecting.

### Debugging & observability
Error boundaries must **log** the errors they catch — never silently swallow them (fixed 2026-05-22, `baf3031`: the app error boundary now logs caught errors instead of discarding them, so production failures surface in logs). Any new catch block or boundary you add must log with enough context to trace the failure.

### Mandatory closing checklist (every task)

Before you tell me a task is complete, you MUST perform this checklist on the stage's CONTEXT.md:

1. Update **Last updated** to today's date (YYYY-MM-DD)
2. Update **State** if it changed (⚪ → 🟡 → ✅ or → 🔴)
3. Update **Next** with the literal next action — be specific, not "continue building"
4. Update **Blocked on** if a new blocker appeared, or set to "Nothing" if a blocker cleared
5. Update **Files in play** if new files were added to the stage

If you report task completion without performing this checklist, the task is incomplete. Treat this rule as you would a failing test — you cannot ship without it.

---

## Working Principles (how to approach every task)

These govern *how* you work. They are general guidance, not hard constants — the **Absolute Rules (and Locked Decisions) above win on any conflict.** When a principle here pushes one way and a rule above pushes the other, the rule wins, every time.

### 1. Think before coding
Don't assume, don't hide confusion, surface tradeoffs. If a request is ambiguous, state the interpretations and ask — don't pick one silently. If a simpler approach exists, say so before implementing. If something is unclear, name it and stop rather than guess.

### 2. Simplicity first
Ship the minimum code that solves the problem. No speculative features, no abstractions for single-use code, no configurability nobody asked for, no error handling for impossible scenarios. The test: would a senior engineer call this overcomplicated? If yes, simplify. Do not add dependencies, tooling, or test infrastructure as a side effect of an unrelated task — if a task genuinely needs new infrastructure, flag it and ask first.

### 3. Surgical changes
Touch only what the request requires. Don't improve adjacent code, don't refactor what isn't broken, match existing style even where you'd do it differently. Remove imports or variables your own changes orphaned — but never delete pre-existing dead code without asking. Every changed line should trace directly to the request. This holds with extra force in the sensitive areas this file already flags — `/apply`, archetype config, legal copy — and anywhere governed by the Absolute Rules.

### 4. Goal-driven execution
Define success criteria before coding, then loop until verified. Here, "verified" means: `tsc` typechecks with no new errors, `next build` succeeds, and relevant automated tests pass — E2E via Playwright, unit via Vitest. For schema changes, `prisma generate` runs clean and the diff is shown for manual review before any push (never auto-push — Producer shares the Postgres instance). For multi-step tasks, state a brief numbered plan with a verification check per step before starting.

> These principles bias toward caution over speed. For trivial changes — typo fixes, obvious one-liners — use judgment and skip the full rigor.

---

## Stage map

| # | Stage | State | V1 items |
|---|---|---|---|
| 01 | `_context/01-apply/` | ✅ Shipped | #1, #5 |
| 02 | `_context/02-approval/` | ✅ Shipped | #4, #16 |
| 03 | `_context/03-events/` | ✅ Shipped | #6, #13, #14, #15, #23 |
| 04 | `_context/04-access/` | ✅ Shipped | #7, #8, #21 |
| 05 | `_context/05-payments/` | ✅ Shipped | #9, #10, #21, #25 |
| 06 | `_context/06-wallet-checkin/` | 🔶 Partial | #11, #12 |
| 07 | `_context/07-operator-dashboard/` | ✅ Shipped + 🟡 RBAC partial (#28 roles shipped, coverage incomplete; Add Member PR #4 open) | #20, #22, #24, #28 |
| 08 | `_context/08-mcp-server/` | 🔶 Partial | #17 |
| 09 | `_context/09-ai-chat/` | ✅ Shipped | #18 |
| 10 | `_context/10-ai-event-builder/` | 🔶 Partial | #19 |
| 11 | `_context/11-producer-integration/` | ✅ Shipped | #20, #26, House Phone trigger (V1.5) |
| 12 | `_context/12-intelligence/` | ✅ Shipped (base + House Phone tab) / 🔶 sponsor-facing partial | #27 |
| 13 | `_context/13-dev-tooling/` | ✅ Shipped (internal) | — |
| 14 | `_context/14-house-phone/` | 🟡 In progress (inbox UI + analytics shipped; awaiting `TWILIO_*` + Railway deploy) | House Phone SMS inbox + Intelligence tab (post-V1) |

> **#18 (Stage 09 — AI chat panel):** direct Vercel AI SDK + MCP tool registry (`lib/mcp/`). Runtype orchestration deferred to V1.5.

---

## Environment Variables (always-required)

- `DATABASE_URL` — Neon pooled connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL`
- `ANTHROPIC_API_KEY` — application archetype scoring + personalization

**Code-complete, value not yet set in Vercel** (features no-op until set):

- `PASSNINJA_API_KEY` — wallet passes (#11). Required by `lib/wallet-pass.ts`.
- `PASSNINJA_ACCOUNT_ID` — wallet passes (#11). Required alongside the API key.
- `PASSNINJA_PASS_TYPE` — wallet pass-type slug (defaults `nobc.member`). NOTE: the code reads `PASSNINJA_PASS_TYPE`, not `PASSNINJA_TEMPLATE_ID`.
- `SVIX_API_KEY` — outbound operator webhooks (#20). `getSvix()` returns null until set.
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` — House Phone outbound reply sends from nobc-os (`POST /api/sms/reply`). See the Twilio override note in Absolute Rules.
- `HOUSE_PHONE_WORKSPACE_ID` — the workspace that owns the House Phone SMS inbox. Used to scope conversations where there is no Clerk session (the Railway inbound service; reserved for any nobc-os SMS path that lacks a session).

Stage-specific env vars live in each stage's `CONTEXT.md`.

---

## Design tokens (always-loaded — reference values, do not hardcode)

> These hex values document what the CSS variables resolve to. They are reference only. In component code, always use the semantic tokens (`bg-primary`, `text-text-primary`, etc.), never these literals. The "No hex literals" rule in Absolute Rules takes precedence.

- Background day: `#f9f7f2` / night: `#1a1520`
- NBC Red: `#B22E21` — primary buttons, accents
- Purple (night): `#7F77DD` — night mode accent
- PP Editorial New — display headings (serif italic)
- Neue Haas Grotesk — body and UI
- All buttons NBC Red. No exceptions.
- Radix UI primitives (WCAG 2.2 AA)
- Lucide React for icons

---

## Where things live

- Stage contracts: `_context/NN-stage-name/CONTEXT.md`
- Stage map + how-to: `_context/README.md`
- Methodology + template: the `nobc-icm` skill
- Schema: `prisma/schema.prisma`
- Singletons: `lib/db.ts`, `lib/auth.ts`
