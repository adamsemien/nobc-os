# NoBC OS — Claude Code Reference (L0 Router)

## What This Is

NoBC OS is the member-facing platform for No Bad Company — a premium curated member club and event operator. Part of a stack alongside Producer (operator-facing, on Replit). AI runs in-process via the Anthropic API + Vercel AI SDK; there is no external agent runtime (Runtype was evaluated and scratched).

**Tenant Zero is NoBC.** Built multi-tenant from day one to sell as SaaS to other premium member clubs (Soho House-tier target).

---

## Product source of truth

Before proposing product or feature work, read `_context/NoBC_OS_Operating_Doc.md`. It holds the Constitution, locked decisions, and the four-layer model. Decisions there are authoritative. Items marked OPEN are unsettled. Ask first.

> If `_context/NoBC_OS_Operating_Doc.md` is missing from the repo, treat product/feature work as blocked on it: ask Adam to add it rather than proposing from memory.

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
- **AI:** two-tier Claude policy via the Vercel AI SDK + the Anthropic API directly, defined in `lib/ai/runtime-models.ts`: `JUDGMENT_MODEL` (`claude-sonnet-4-6`) for judgment / member-facing tasks, `MECHANICAL_MODEL` (`claude-haiku-4-5-20251001`) for mechanical / bulk tasks (see Locked Decisions). The operator chat panel runs in-process through `lib/agent/`; the MCP server at `/api/mcp` is an unconsumed surface awaiting a future agent client. **There is no external agent runtime.** Runtype was evaluated and scratched.
- **Deploy:** Vercel
- **Testing:** Vitest (unit) + Playwright (E2E). Unit harness added 2026-05-22 (`npm run test:unit`).

---

## Current Build State

**As of 2026-05-28 — V1 is functionally complete.**
17/20 V1 items are DONE in code. 2 are PARTIAL (credentials only, not code). 0 are NOT STARTED.
A May-2026 session added the House Phone SMS inbox (Runtype evaluated and **scratched** — final architecture is a standalone Node.js service on Railway), the member-QR rollout, the editorial event-page redesign, operator roles, the House Phone Intelligence tab, and the Digital Asset Manager through Phase 4 — see "What shipped beyond V1 scope" below.

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
- Operator RBAC coverage is essentially complete — every `/api/operator/*` write, `/api/stripe/refund`, `/api/agent/*`, and `/api/intelligence/{compose,reports}` are `requireRole`-gated, and a Clerk-org floor keeps org admins from being locked out. The `/api/mcp` **Clerk-session** path is now role-gated (default-deny to STAFF, PR #51); only its **external `Bearer`** write path still needs its own auth design (in flight — see STATE-OF-PLAY). (House Phone `/api/sms/*` is intentionally Clerk-org-membership-gated. `/api/check-in/*` now uses **event-scoped signed tokens** minted server-side for STAFF+, NOT the old `CHECKIN_SECRET` browser bearer — changed PR #59. See Roles & Permissions.)
- Set `TWILIO_*` + `HOUSE_PHONE_WORKSPACE_ID` in Vercel and deploy the Railway inbound service to take House Phone live end-to-end

### What shipped beyond V1 scope (already live)

- Comp tickets, 7-theme white-label system, hero images, bulk delete, compliance pages
- Producer Phase J webhook integration
- Intelligence system, ticketing V2/tiers, event series, lists, comments, notifications
- Cmd+K palette, event room/vibe, model switcher
- Internal QA/persona/seed dev tooling

**May-2026 session — all PRs #1–#38 merged to main; PR #39 (DAM Phase 4) open at time of writing.**
- **House Phone** — shared multi-operator SMS inbox. **Architecture: outbound replies + inbox UI in nobc-os (`/api/sms/*`, `/operator/house-phone`); inbound on a separate standalone Node.js service on Railway (`nobc-house-phone`).** Runtype was evaluated for the inbound path and **scratched** — too much latency for synchronous SMS reply, too much indirection for raw Twilio signature validation + per-phone rate limiting. Stage 14.
- **Member QR rollout** — `lib/member-qr.ts` `generateMemberQrCode()` is now the single mint path for every production Member-creation route, so non-member ticket buyers get a scannable QR (fixes the paid-purchase email + door scan). Stages 02/05/06.
- **Operator RSVP bypass + guest-flow fix** — signed-in non-members can complete the guest flow; operators can bypass the access flow (free + paid) and preview it. Stage 04.
- **Event-page editorial redesign** — all three member event-detail templates (Split, Editorial, Minimal), cream paper tokens, warm access copy, hero **upload** in event settings. Stage 03. (PR #3.)
- **Add Member (manual member creation)** — `POST /api/operator/members/create` + Add Member slide-over. Stage 07. (PR #4, merged.)
- **Operator roles** — `OperatorRole` (ADMIN/STAFF/READ_ONLY) + `WorkspaceMember` + `lib/operator-role.ts`, Team settings UI. Stage 07. (PR #5.)
- **House Phone Intelligence tab** — `GET /api/sms/analytics` + `GET /api/sms/categorize` + `SmsMessage.category`, surfaced in the Intelligence dashboard. Stages 12/14. (PR #6.)
- **Vitest unit harness** + `toScoreDisplay` tests. Stage 13.
- **Sponsor Intelligence dashboard** + Clerk-org-aware role floor + RBAC route-protection audit + funnel/sponsor-nav fixes. Stages 07/12. (PRs #7–#22.)
- **Split-template member event-page polish** — 50/50 hero, hero-upload discoverability, post-merge review. Stage 03. (PRs #23–#25.)
- **Digital Asset Manager (DAM)** — operator media library at `/operator/media`. Stage 15.
  - **Phase 1 — Foundation** (PR #26, merged): R2 private storage, Sharp image processing, BlurHash, EXIF `shootDate`, async Cloudflare Workers AI tagging + heuristic scoring, upload API.
  - **Phase 2a — Operator grid** (PR #27, merged): justified-layout grid, FTS, folder tree, sort/filter, density toggle, signed thumbnails.
  - **Phase 2b — Grid interactions** (PR #29, merged): bulk action bar, full-screen preview + inline edit, drag-drop batch upload, FLIP transitions, trash restore/purge, Top Picks.
  - **HEIC ingest** (PR #30, merged): accept iPhone HEIC, convert to JPEG via libheif wasm, preserve EXIF.
  - **Polish + design pass** (PR #31, merged): label legibility, brand-red interactive states, selection wash.
  - **Demo media seed** (PRs #32 + #37, merged): `scripts/seed-dam.ts` + DevToolbar Seed / Clear Demo Media buttons.
  - **ShareLink schema** (PR #38, merged): `watermark Boolean @default(false)` + `allowedDownloads Int?`.
  - **Phase 4 — External share surfaces** (PR #39, **open / not yet merged**): public `/assets/[token]` (sponsor) + `/gallery/[slug]` (member), `CreateShareModal`, `/operator/media/shares`, password-gated HttpOnly cookie, watermark + download-cap enforcement. Shipped 2026-05-28.
- **DevToolbar surface polish** — Settings → Developer entry (PR #33), Shortcuts cheat-sheet (PR #36), help-text drift fix (PR #35). Stage 13.
- **Full-width operator data pages** (PR #34, merged) — all 8 operator data pages (Events, Applications, Members, Activity + their detail/New pages) dropped `mx-auto max-w-[…]` caps and adopted the dashboard's wide gutters. **Settings/forms pages intentionally keep their narrow caps — by design, not bugs.** Stage 07.
- **Applications review-panel widen on wide viewports** (PR #28, merged). Stage 02.

---

## Locked Decisions (NEVER override)

These are hard constants. Any agent that violates them is broken.

- **Email `from` address:** `team@thenobadcompany.com` — always, every transactional email, every welcome, every notification
- **AI models (two-tier):** every runtime Anthropic call uses one of two models defined in `lib/ai/runtime-models.ts`. Do not substitute a different model, do not swap providers, do not move a site to a cheaper tier to save cost. Adam decides model bumps and tier moves explicitly. (The prior single locked Sonnet model was retired by Anthropic and now returns 404, which is why this is a two-tier policy.)
  - **`JUDGMENT_MODEL`** = `claude-sonnet-4-6` - judgment / member-facing tasks: application scoring (`lib/scoring.ts`), reveal personalization, application tagging (`lib/ai/tag-application.ts`), the AI event builder, event-description generation, the Intelligence composer (`lib/intelligence/composer.ts`), and the operator chat agent (`lib/agent/`).
  - **`MECHANICAL_MODEL`** = `claude-haiku-4-5-20251001` - mechanical / bulk tasks: DAM alt-text, firmographics backfill, House Phone SMS triage + categorization (`GET /api/sms/categorize`), and the recap / sponsor-briefing narratives (`app/operator/intelligence/sponsor/actions.ts`).
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
- **Never expose raw enum values in UI** — `TICKETED`, `OPEN`, `MemberStatus.GUEST`, `RSVPStatus.WAITLISTED` must always be mapped to display strings. (Historical note: `apply_or_pay` was a third `EventAccessMode` value, removed in commit `b23ab8a` 2026-05-20 — it is now `TICKETED` + `approvalRequired: true`.)
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

> **Demotion caveat:** because the floor overrides explicit grants, a **Clerk org admin cannot be demoted via the Team UI** — to reduce an org admin's access, change their role in **Clerk** (org:admin → org:member). Add new non-founder staff to Clerk as **org:member** so the Team UI can manage their role.

Rules:
1. UI hide/disable is UX only; the `requireRole` check is the real security boundary.
2. **Coverage (audited 2026-05-26; updated 2026-06-09).** `requireRole` gates **every `/api/operator/*` write** — STAFF for operational writes (applications approve/reject/hold/waitlist, events CRUD + comp + promote-waitlist + bulk-delete, rsvps approve/cancel/reject, tiers, series, comments, lists, notifications, members/create), ADMIN for sensitive ones (settings/*, team/*, members/bulk) — plus `/api/stripe/refund` (ADMIN), the `requireRolePage(ADMIN)` settings pages, and `/api/agent/*` + `/api/intelligence/{compose,reports}` POST (STAFF). `/api/mcp` is now role-gated for **Clerk-session** callers (default-deny to STAFF, PR #51); its **external `Bearer`** write path still needs its own auth design (in flight). `/api/check-in/*` now authenticates via **event-scoped signed tokens** minted server-side for STAFF+ (PR #59), replacing the old `CHECKIN_SECRET` browser bearer. GET/read routes stay open to any resolved member.
3. **House Phone (`/api/sms/*`) is intentionally NOT `requireRole`-gated.** It authorizes by Clerk org membership (`auth()` + `getMemberWorkspaceId`): any member of the resolved workspace's Clerk org may view + reply + toggle AI; no `WorkspaceMember` row required. Fixed 2026-05-26 — `requireRole(STAFF)` had drifted onto three of the routes (`/api/sms/conversations`, `/reply`, `/conversation/[id]`) and 403'd a legitimate Clerk org admin who had no `WorkspaceMember` row, blanking the inbox. Clerk org membership is the single source of truth for this shared live-event tool (avoids `WorkspaceMember`-vs-Clerk drift); workspace scoping on the data is unchanged.

> An earlier draft of this section described five roles (owner/admin/manager/staff/readonly) "enforced on every route." That was aspirational and never built — the three roles above are what shipped. Update this section, not your memory, if the model changes.

---

## Architecture (load-bearing detail)

```
Producer (Replit) ←Phase J HMAC webhook→ NoBC OS (Vercel)
       │                                       │
       └──── Both connect to ────────→ Postgres (Neon)
                  same instance

           Twilio (SMS)
              │
              ▼
    nobc-house-phone (Railway, standalone Node.js)
              │  inbound webhook → AI auto-reply → write rows
              ▼
       Postgres (same Neon instance)
              ▲
              │  poll + outbound reply via Twilio REST
              │
         NoBC OS (Vercel) — /operator/house-phone, /api/sms/*

    [Runtype is NOT in the House Phone path — see "House Phone — Runtype scratched" below.]
```

**Critical:** Producer and NoBC OS share the SAME Postgres instance. This is why schema changes are production-affecting and must NEVER auto-push — they could break Producer.

> ⚠️ **2026-06-09 — this "shared Postgres" claim is contradicted by live config and is under verification.** Verified: separate databases in dev (Producer → `helium/heliumdb`; NoBC → Neon `ep-twilight-forest-…`) and **separate Clerk apps**. Producer is effectively a standalone dev-stage tool (no prod env yet). The only unconfirmed gap is Producer's *production* `DATABASE_URL`. Until that's confirmed, do NOT assume a shared DB. The `db push` ban stands regardless (it's correct on any DB). See `_context/_audit/PRODUCER-OPERATOR-STRATEGY.md` + `STATE-OF-PLAY.md`.

Phase J details:
- HMAC-SHA256 with shared secret
- Header: `X-NoBC-Signature`
- Fire-and-forget pattern, one retry, queue on failure
- Env vars: `PRODUCER_WEBHOOK_URL`, `PRODUCER_WEBHOOK_SECRET`

**House Phone — Runtype scratched.** Earlier drafts of this file routed House Phone SMS through a Runtype master agent / Communications sub-agent. That was evaluated and **dropped** — the inbound path needs synchronous Twilio webhook receipt + signature validation + per-phone rate limiting + a tight AI-reply turnaround, and routing through a master agent added latency and opacity for no offsetting benefit. Final architecture, in two halves on the same Postgres:

- **Inbound** SMS runs on a separate **standalone Node.js service on Railway** (`nobc-house-phone`, its own repo — Twilio webhook receipt, signature validation, contact lookup, AI auto-reply via Haiku) that writes `SmsConversation`/`SmsMessage`.
- **Outbound** replies + the operator inbox UI live in nobc-os (`/api/sms/*`, `/operator/house-phone`), sending via the Twilio REST API directly under the explicit Twilio override.

No Runtype in either half. See `_context/14-house-phone`. Runtype is still on the V1.5 roadmap for the operator AI chat panel (Stage 09) and the AI Event Builder (Stage 10) — those are unrelated to House Phone and not scratched.

---

## Absolute Rules (apply to every stage)

### Twilio — House Phone SMS only
Twilio is approved for the House Phone SMS feature (`lib/twilio.ts` + `/api/sms/reply`) and - per Adam's 2026-07-02 directive (Phase 4C) - the attendee blast layer (Stage 18), which sends from `MARKETING_TWILIO_PHONE_NUMBER` only via `sendMarketingSms` in `lib/twilio.ts`. The conversational `TWILIO_PHONE_NUMBER` stays House Phone's. Do not add Twilio to any other feature without explicit approval.

### Workspace scoping is the security boundary
Every read and every write is workspace-scoped. `workspaceId` is on every user-data table, indexed, and checked on every query. No exceptions.

### No hex literals in components
All colors are CSS variables. Semantic tokens only: `bg-primary`, `text-text-primary`. The theme system supports white-labeling for multi-tenant SaaS.

### Schema changes: never `prisma db push`
`prisma db push` is forbidden on this repo, full stop. It will attempt to drop **`Asset_searchVector_idx`** — the GIN index that powers DAM full-text search. That index lives only in the production database, created out-of-band by `prisma/sql/dam-search-vector.sql`; it is NOT in `schema.prisma` because Prisma cannot represent a GIN index on its `Unsupported("tsvector")` type. A `db push` run treats the index as drift and removes it, breaking `/operator/media` search until someone re-runs the SQL by hand. Producer also shares this Postgres instance — a `db push` is doubly destructive.

The same landmine applies to **`ChannelSubscription_person_channel_stream_key`** (CRM spine Slice 0) — a partial unique index on `ChannelSubscription("workspaceId", "personId", "channel", "stream") WHERE "memberId" IS NULL AND "personId" IS NOT NULL`, applied out-of-band because Prisma's `@@unique` cannot express a `WHERE` clause. It enforces uniqueness for person-only (no Member) consent rows. A `db push` would see it as drift and drop it, silently reopening the door to duplicate person-keyed consent rows.

Same landmine again with **`SegmentSnapshotMember_segment_person_key`** and **`SegmentSnapshotMember_segment_member_key`** (Slice 4 — Segments, saved views & the operator-action log) — two partial unique indexes on `SegmentSnapshotMember("segmentId", "personId") WHERE "personId" IS NOT NULL` and `SegmentSnapshotMember("segmentId", "memberId") WHERE "memberId" IS NOT NULL`, applied out-of-band for the same reason: Prisma's `@@unique` can't express a `WHERE` clause, and the dual-pointer (`personId`/`memberId`, both nullable) shape means neither column alone is a plain-`@@unique` candidate the way `ChannelSubscription`'s `memberId`-based constraint was. They enforce that a STATIC segment's frozen snapshot can't carry a duplicate row for the same person or the same member. `SegmentSnapshotMember` intentionally carries no `@@unique` in `schema.prisma` at all — the uniqueness guarantee lives only in these two raw indexes. A `db push` would see them as drift and drop them, silently reopening the door to duplicate snapshot rows.

Next four entries, **PENDING APPLICATION** — the gate-layer Person-primary retrofit (`prisma/sql/gate-engine-person-primary-retrofit.sql`, drafted 2026-07-10 on `feature/gate-engine-person-primary-retrofit`, NOT yet run in Neon) adds **`GateProof_node_person_key`** (`GateProof("nodeId", "personId") WHERE "personId" IS NOT NULL`) plus three `GrowthEdge` endpoint-pair partials — **`GrowthEdge_ws_type_fromPerson_toPerson_key`**, **`GrowthEdge_ws_type_fromMember_toPerson_key`**, **`GrowthEdge_ws_type_fromPerson_toMember_key`**. Same reason as always: Prisma's `@@unique` cannot express a `WHERE` clause. (The member-side uniques — `GateProof @@unique([nodeId, memberId])`, `GrowthEdge @@unique([workspaceId, type, fromMemberId, toMemberId])` — stay in `schema.prisma` and behave as partials via Postgres NULLs-distinct semantics, so they are NOT landmines.) Once Adam applies the SQL, a `db push` would see all four as drift and drop them, reopening duplicate person-keyed proofs and growth edges. Until applied, these indexes do not exist in any database and the production gate layer remains Member-keyed.

The required workflow for any additive schema change:

1. Edit `prisma/schema.prisma`.
2. Run `prisma generate` to update the client.
3. Run `prisma migrate diff --from-schema <pre-edit schema copy> --to-schema prisma/schema.prisma --script` and review the SQL — refuse any DROP, ALTER TYPE, or RENAME. (Prisma 7 removed the old `--from-schema-datamodel`/`--from-schema-datasource` flags; the `--from-schema`/`--to-schema` form is datamodel-to-datamodel and fully offline — it never connects to Neon.)
4. Apply the additive SQL with `prisma db execute --file <migration.sql>` against the Neon DB. Never `db push`, never auto-push, never use `--accept-data-loss`.

For non-additive changes (drops, renames, type changes), stop and ask Adam — coordination with Producer is required before any destructive migration.

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
| 11 | `_context/11-producer-integration/` | ✅ Shipped (Phase J + Svix) — **House Phone is not in this stage anymore (Runtype scratched)** | #20, #26 |
| 12 | `_context/12-intelligence/` | ✅ Shipped (base + House Phone tab) / 🔶 sponsor-facing partial | #27 |
| 13 | `_context/13-dev-tooling/` | ✅ Shipped (internal) — DevToolbar now also openable from Settings → Developer (PR #33) | — |
| 14 | `_context/14-house-phone/` | 🟡 In progress (inbox UI + analytics shipped; awaiting `TWILIO_*` + Railway deploy; Railway service = standalone Node.js, NOT Runtype) | House Phone SMS inbox + Intelligence tab (post-V1) |
| 15 | `_context/15-media-dam/` | 🟡 In progress (Phases 1, 2a, 2b, HEIC, seed, ShareLink schema all merged; Phase 4 PR #39 open / not merged; Phase 3 deferred; Phases 5–6 not started) | Digital Asset Manager (post-V1) |
| 17 | `_context/17-access-gate-engine/` | ✅ Shipped — merged to `main` via `ecf1d07` (2026-07-03), deployed to production (Adam verified via Vercel, 2026-07-10): nested GateNode engine, 7 condition types (M1–M4-PAY + builder rebuild + D6 + Night + loose ends + Ways-In Phase A). 🟡 Person-primary retrofit SQL drafted, NOT applied (see landmine list). Full as-built audit: `docs/gate-engine-m1-recon.md` | Access Gate Engine v3 |
| 18 | `_context/18-attendee-messaging/` | ✅ Merged to `main` via `ecf1d07` (2026-07-03) with the event-builder rebuild (blast layer: email + SMS, dry-run-first); SMS needs `MARKETING_TWILIO_PHONE_NUMBER` | Attendee messaging (post-V1) |

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
- `MARKETING_TWILIO_PHONE_NUMBER` — the attendee blast layer's send-from number (Stage 18). Unset → the SMS blast surface renders disabled with honest copy (fail-soft); email blasts are unaffected. Never the House Phone number.

**Optional:**

- `APPLY_DEFAULT_WORKSPACE_ID` — workspace for the slug-less public membership apply form (`/api/apply/membership`). Unset → falls back to the oldest workspace (single-tenant safe). Set it before onboarding a second tenant (PR #60).
- `CHECKIN_SECRET` — server-only HMAC key for minting/verifying event-scoped check-in tokens (PR #59). If unset, check-in mint/verify fail closed (door scanning unavailable). NOT exposed to the browser.

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

- **▶ RESUME HERE (live session state, read first): `_context/_audit/STATE-OF-PLAY.md`** — what shipped, in-flight agents, open gates, ownership.
- Stage contracts: `_context/NN-stage-name/CONTEXT.md`
- Stage map + how-to: `_context/README.md`
- Methodology + template: the `nobc-icm` skill
- Schema: `prisma/schema.prisma`
- Singletons: `lib/db.ts`, `lib/auth.ts`
- **Producer↔Operator architecture decision + the shared-Postgres `db push` landmine: `_context/_audit/PRODUCER-OPERATOR-STRATEGY.md`** — read before any cross-app or schema work.
