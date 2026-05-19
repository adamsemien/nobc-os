# NoBC OS — Claude Code Reference

## What This Is

NoBC OS is the member-facing platform for No Bad Company — a premium curated member club and event operator. It handles member applications, approvals, event RSVPs, ticketing, wallet passes, and check-in. It is part of a three-layer stack alongside Producer (operator-facing event ops, on Replit) and a Runtype + Tenur AI layer.

**Tenant Zero is NoBC.** The platform is built multi-tenant from day one to sell as SaaS to other premium member clubs and event operators (Soho House-tier target).

---

## Stack

- **Framework:** Next.js 15, App Router, TypeScript, Tailwind CSS v3
- **DB:** Postgres on Neon (serverless, pooled connection) + Prisma 7
- **Auth:** Clerk with Organizations (org = workspace = tenant)
- **Email:** Resend (transactional only) — `from` is always `team@thenobadcompany.com`
- **Payments:** Stripe (authorize/capture pattern)
- **AI:** Claude via direct Anthropic API. **Model for all AI calls: `claude-sonnet-4-20250514`**
- **Agent runtime:** Runtype (V1.5 — master agent + House Phone sub-agent)
- **Deploy target:** Vercel — `vercel deploy --prod`

---

## Absolute Rules

### No Twilio. Ever.
NoBC OS never calls Twilio directly. All SMS flows through the House Phone (Communications sub-agent inside Runtype). No Twilio SDK, no Twilio env var. Non-negotiable.

### Workspace scoping is the security boundary
Every read and every write is workspace-scoped. `workspaceId` is on every user-data table, indexed, and checked on every query. No exceptions.

### No hex literals in components
All colors are CSS variables — semantic tokens only (`bg-primary`, `text-text-primary`). Hex values live only in `app/globals.css` (`:root` + `[data-theme]` selectors). The theme system supports white-labeling for multi-tenant SaaS.

### Schema changes: generate then push manually
Run `prisma generate` first. Show the diff. Never auto-push. Producer shares the same Postgres instance — schema changes are production-affecting.

### Locked decisions
- Email `from` address: `team@thenobadcompany.com` — always.
- AI model: `claude-sonnet-4-20250514` — every call.
- Never modify legal copy in the `/apply` waiver.
- Never break `/apply`, archetype config, or existing scoring.

---

## Architecture: How the Three Layers Connect

```
Producer (Replit) ←→ NoBC OS (Vercel) via Phase J HMAC webhook
    Both connect to same Postgres (Neon)

NoBC OS → Runtype Master Agent → House Phone (Communications sub-agent) → Twilio
    NoBC OS never calls Twilio directly

House Phone reads member data via NoBC OS MCP (V1.5)
```

**Phase J webhook:** When NoBC OS publishes/updates/cancels an event, it fires an HMAC-SHA256-signed POST to Producer's `/api/webhooks/nobc-os/event-notify` with an `X-NoBC-Signature` header. Fire-and-forget, one retry, never blocks the operator action. Result logged to `AuditEvent`. Env: `PRODUCER_WEBHOOK_URL`, `PRODUCER_WEBHOOK_SECRET`.

---

## V1 Scope Status

| #  | Item | Status |
|----|------|--------|
| 1  | Branded `/apply` form (cinematic 7-step, reveal screen, demo mode, Frogger easter egg) | ✅ done |
| 2  | Postgres + Prisma schema with all NoBC OS models | ✅ done |
| 3  | Clerk auth + workspace integration | ✅ done |
| 4  | Approval workflow + welcome email (Resend — approve/reject/hold/waitlist) | ✅ done |
| 5  | AI scoring on application submit (archetype + dimension scoring) | ✅ done — **question-agnostic as of this build** |
| 6  | Branded `/m/events` calendar + `/m/events/[slug]` detail pages (3 templates) | ✅ done |
| 7  | RSVP system (open / ticketed / apply_or_pay + sub-modes) | ✅ done |
| 8  | `approval_required` toggle | ✅ done |
| 9  | Stripe payments (authorize/capture) | ✅ done |
| 10 | Operator-triggered refund system | ✅ done |
| 11 | Apple Wallet + Google Wallet passes | 🔶 partial (routes scaffolded) |
| 12 | Offline-first QR check-in PWA (IndexedDB + Dexie) | ✅ done |
| 13 | Custom question builder per event (8 field types) | ✅ done |
| 14 | Capacity + waitlist with auto-promotion | ✅ done |
| 15 | Plus-ones (per-event toggle) | ✅ done |
| 16 | Red List + duplicate handling on application submit | ✅ done |
| 17 | NoBC OS MCP server (read + write tools) | 🔶 partial (`/api/mcp` live) |
| 18 | AI chat panel (operator Cmd+K) | ✅ done |
| 19 | AI Event Builder (text generation) | ✅ done |
| 20 | `AuditEvent` table + Svix webhooks + WCAG 2.2 AA | ✅ done |
| 21 | Comp tickets (operator issue, QR, email) | ✅ done |
| 22 | 7-theme operator theme system | ✅ done |
| 23 | Hero image system (Blob URL passthrough) | ✅ done |
| 24 | Operator bulk delete | ✅ done |
| 25 | Compliance pages (`/terms`, `/privacy`, `/refund-policy`) | ✅ done |
| 26 | Producer Phase J event-notify webhook | ✅ done |
| 27 | Question resilience + Intelligence system | ✅ done |
| 28 | Roles & permissions (Clerk Organizations) | ✅ done |

---

## Schema Models (Postgres / Neon)

All workspace-scoped with `workspaceId` indexed:

- **Workspace** — tenant boundary. White-label fields: `logoUrl`, `primaryColor`, `contactEmail`, tier names, `defaultTemplateId`.
- **Member** — approved members; `status != GUEST` when listing "members".
- **Application** — application workflow with AI enrichment; `templateId` links to its `ApplicationTemplate`.
- **ApplicationAnswer** — per-question answers keyed by `questionKey` (= `QuestionDefinition.stableKey`).
- **ApplicationTemplate** — named application form definitions, one per `slug` → `/apply/[slug]`.
- **QuestionDefinition** — question registry with stable keys, insight metadata, and per-question scoring logic. Drives question-agnostic AI scoring.
- **Event** — NoBC events with `accessMode` / `approvalRequired` / plus-ones / `eventAccess` JSON.
- **EventCustomQuestion** — per-event registration fields (8 field types).
- **RSVP** — all access modes, Stripe payment fields, check-in fields, wallet pass fields.
- **Ticket / Payment** — Stripe authorize/capture lifecycle.
- **WaitlistEntry** — capacity overflow with auto-promotion.
- **AuditEvent** — full audit trail with `actorType` enum (`OPERATOR`, `AGENT`, `MEMBER`, `SYSTEM`).
- **RedList** — denylist for application submission.
- **EventFlowTemplate** — reusable event configuration presets.

**Roles** are stored in Clerk Organization membership metadata (`owner`, `admin`, `manager`, `staff`, `readonly`), not in Postgres.

---

## Key Files

```
prisma/schema.prisma                          — all models
prisma.config.ts                              — Prisma 7 config with Neon adapter
lib/db.ts                                     — PrismaClient singleton via PrismaNeon adapter
lib/auth.ts                                   — getOrCreateWorkspaceForUser + requireWorkspaceId
lib/permissions.ts                            — checkPermission(userId, action) — role-based access
lib/theme.ts                                  — 7-theme system config
lib/event-access.ts                           — event access resolution + gate logic
lib/audit.ts                                  — AuditEvent writer (actorType-aware)
lib/scoring.ts                                — question-agnostic AI scoring
lib/producer-webhook.ts                       — Phase J HMAC webhook to Producer
lib/demo-data.ts                              — synthetic data for Intelligence demo mode
config/archetypes.ts                          — 6 archetype definitions
app/apply/_components/MembershipForm.tsx       — 7-step cinematic application form
app/operator/_components/AgentPanel.tsx        — Cmd+K operator AI chat panel
middleware.ts                                 — Clerk protecting /m/* and /operator/*
```

---

## Environment Variables

```
# Database
DATABASE_URL                          — Neon pooled connection string (-pooler in hostname)

# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET

# App
NEXT_PUBLIC_APP_URL

# Email
RESEND_API_KEY

# Payments (Stripe)
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET

# Webhooks
SVIX_SECRET                           — Svix webhook signing
PRODUCER_WEBHOOK_URL                  — Phase J outbound to Producer
PRODUCER_WEBHOOK_SECRET               — HMAC secret shared with Producer

# AI
ANTHROPIC_API_KEY                     — Claude API (model claude-sonnet-4-20250514)

# V1.5
RUNTYPE_API_URL                       — House Phone integration
```

---

## Routing

```
PUBLIC
/apply                          ← default public application form
/apply/[slug]                   ← application form for a named ApplicationTemplate
/apply/thanks                   ← post-submission screen
/terms /privacy /refund-policy  ← compliance pages

MEMBER (Clerk-protected /m/*)
/m/events                       ← member event calendar
/m/events/[slug]                ← member event detail
/m/pass                         ← member wallet pass

CHECK-IN
/check-in/[slug]                ← staff check-in PWA (staff role and above)

OPERATOR (Clerk-protected /operator/*)
/operator/applications          /operator/applications/[id]
/operator/events                /operator/events/new        /operator/events/[id]
/operator/intelligence          ← community / insights / sponsors / trends dashboard
/operator/audit
/operator/settings/questions    ← question builder
/operator/settings/applications ← application template builder
/operator/settings/team         ← team & roles management
/operator/settings/workspace    ← white-label workspace settings
/operator/settings/webhooks

API
/api/apply/membership/*         ← membership application submit + review
/api/apply/[slug]               ← named-template submission
/api/agent                      ← operator AI chat agent (read + write tools)
/api/agent/chat /api/agent/event-builder
/api/mcp                         ← NoBC OS MCP server
/api/rsvp/* /api/check-in/* /api/stripe/* /api/wallet/*
/api/operator/*                  ← operator actions (permission-gated)
/api/webhooks/nobc/* /api/webhooks/stripe
```

---

## Operator Theme System

7 themes, toggled via `data-theme` attribute, persisted to `localStorage`. Config in `lib/theme.ts`; CSS variable values in `app/globals.css` (`:root` + `[data-theme=...]`).

| id | label | id | label |
|----|-------|----|-------|
| `nobc` | Light | `parchment` | Parchment |
| `midnight` | Midnight | `void` | Void |
| `obsidian` | Obsidian | `ember` | Ember |
| `rose` | Rosé | | |

---

## AI Scoring (question-agnostic)

As of this build, AI scoring is **fully question-agnostic**. The scoring prompt no longer references hardcoded field names. It receives the active `QuestionDefinition` records (`stableKey`, `insightLabel`, `scoringDimension`, `scoringWeight`, `scoringLogic`) and scores each answer against its own `scoringLogic`. Adding a question automatically includes it in scoring; removing or renaming one never breaks scoring. Logic lives in `lib/scoring.ts`.

Dimensions: `influence`, `contribution`, `activation`, `taste`.
Archetypes: Connector, Host, Curator, Builder, Maker, Patron.

**Score scale (canonical):** `Application.aiScore` is `0–1` — the rebuilt `scoring.ts` output. Any `/30` is **display-only** (`aiScore × 30`); percentage display is `aiScore × 100`. Tier cutoffs on the 0–1 scale: **charter ≥ 0.73** (22/30), **standard ≥ 0.53** (16/30), **waitlist** below. Note: `lib/intelligence/worth.ts` computes a separate `worthTotal` (0–30) from the six archetype scores — a different metric, not `aiScore`.

---

## Roles & Permissions

Roles live in Clerk Organization membership metadata. `lib/permissions.ts` exposes `checkPermission(userId, action)`. Every operator API route is permission-gated (403 on failure) and every check logs an `AuditEvent`. The operator UI hides/disables unauthorized actions — but the API is the real boundary.

- **owner** — full access incl. workspace settings + billing. One per workspace.
- **admin** — full access except billing + workspace deletion.
- **manager** — approve/reject applications, create/publish events, view intelligence, issue comps.
- **staff** — check-in PWA only.
- **readonly** — view applications/events/intelligence; no writes.

---

## Canonical Terminology (locked — UI copy, variables, comments)

- How people get in → "Access" / "Event Access"
- The three groups → "Member Access", "Guest Access", "Comp Access"
- Free + no friction → "Open" / "Register"
- Curated/approval → "Apply to Attend"
- Requires payment → "Ticketed"
- Complimentary ticket → "Comp"
- Non-member ticket buyer → "Guest" (`MemberStatus=GUEST`)
- Approved NoBC member → "Member"
- Custom questions → "Registration fields"
- Never: raw enums in UI (no "apply_or_pay", no "OPEN")
- Never: "RSVP" in operator UI — say "Registrations" or "Attendees"
- CTAs: "Register" (open), "Apply to Attend" (curated), "Get Ticket — $X" (ticketed), "Reserve My Spot" (member auto-confirm), "You're on the list" (comp)

---

## Design System (NoBC preset — match Producer quality)

- Background `#F9F7F2`, Accent/Primary `#B22E21` — as CSS variables only
- Headlines: PP Editorial New (italic for display). Body: Neue Haas Grotesk Display Pro
- Border radius: 10px cards, 6px buttons
- No generic Tailwind defaults — no `text-gray-*`, no blue buttons
- Density: Notion/Stripe level — dense but breathable
- Lucide React for icons; Radix UI primitives for accessibility (WCAG 2.2 AA)

---

## Session Discipline

**STATUS.md rules:** max 50 lines. Contains only: current branch / last 5 commits / in flight / blocked / next task. Never duplicate CLAUDE.md. Rewrite lean at end of every session — never append.

---

## Rules

- All DB queries scoped to `workspaceId`
- Run `npm run build` before every deploy; `vercel deploy --prod` to ship
- Never show raw enum values in UI
- Member listings: filter `status != GUEST`
- Schema changes: show diff, never auto-push

---

## Delight Features

Personality features that make the platform feel like No Bad Company. **Do not break these.**

| # | Feature | Status |
|---|---------|--------|
| — | `lib/operator-location.ts` — operator city resolver (override → member city → IP geo → Austin) | ✅ built |
| 1 | Time-aware operator greeting (`lib/greeting.ts`) | 🔶 helper built; not yet wired into a dashboard header |
| 2 | Local weather pill (Open-Meteo, operator city) | ⬜ pending |
| 3 | Charter-tier approval personal note ("approve — say something?") | ⬜ pending |
| 4 | Empty states in Adam's voice | 🔶 Applications queue done; events/members/RSVP/notifications/search/audit pending |
| 5 | Warm error messages | 🔶 `app/error.tsx` (500) done; form-validation + auth copy pending |
| 6 | Custom 404 (`app/not-found.tsx`) — "you wandered off." | ✅ built |
| 7 | AI chat thinking indicator (three dots, italic) | ⬜ pending (tied to deferred Task 2) |
| 8 | Milestone overlays (1/10/50/100/500/1000th member) | ⬜ pending |
| 9 | Application of the week (Monday 9am local) | ⬜ pending |
| 10 | Closed-loop referral notification | ⬜ pending |
| 11 | Birthday spotlight on member profile | ⬜ pending |
| 12 | Fun facts widget on Intelligence Community tab | ⬜ pending (`lib/fun-facts.ts`) |
| 13 | `/credits` slash command (`CONTRIBUTORS.md` created: Adam, Chloe, Nathan) | 🔶 file built; command pending (Task 2) |
| 13 | `/austin`, `/whoami`, `/heatmap`, `/silence` slash commands | ⬜ pending (Task 2) |
| 14 | Founder greeting (type "adam"/"chloe" → 🖤 corner pop) | ⬜ pending |
| 15 | Platform sounds toggle (operator preferences) | ⬜ pending |
| 16 | `/apply` reveal auto-night-mode 11pm–4am | ✅ built |
| 17 | Post-Frogger reverse mode ("you became the system") | ⬜ pending |
| 18 | Time-of-day favicon swap | ⬜ deferred (waiting on brand mark) |
| 19 | Post-approval email P.S. line (AI-picked quote) | ⬜ pending |

---

## Backlog — Deferred This Build

Built and deployed in the question-resilience build: Tasks 1, 3, 4, 5A–C, 5F–G.

**Near-term (next sessions):**
- **Task 2** — Cmd+K operator AI chat panel with ~25 read/write tools. Deferred: needs a focused build.
- **Task 13** — RBAC (Clerk Organizations: owner/admin/manager/staff/readonly), invite flow, `/operator/settings/team`, `/operator/settings/workspace`. Deferred: foundational SaaS work, needs a careful design pass.
- **Task 5 D** — Question builder UI (`/operator/settings/questions`, dnd-kit reorder, AI Assist).
- **Task 5 E** — Application template builder UI (`/operator/settings/applications`).
- **Remaining delight features** — see table above.
- **`/apply` label-casing fix** — `labelStyle`/`chapterLabelStyle` apply `textTransform:uppercase`; design intent is lowercase. Rapid-fire field labels are literal ALL CAPS and need relabeling.
- **Per-theme fonts** — Obsidian (Cormorant + DM Mono), Rosé (Playfair + Jakarta), Parchment (Fraunces + Instrument), Void (Syne + DM Serif). Themes currently change colors only.
- **`/operator/playground`** — owner-only delight-feature trigger page.

## V2 + SaaS Scalability Backlog

Documented for future milestones — not in scope now. Categories: **Security** (audit hardening, secrets rotation, pen-test), **Compliance** (SOC 2, DPA templates, sub-processor registry), **Payments** (Stripe live mode, payouts, multi-currency), **Member Experience** (mobile app, member directory, DMs), **Operator Experience** (CSV exports, email template editor, notification settings), **SaaS Platform** (self-serve onboarding, billing, white-label brand builder), **Infrastructure** (read replicas, queue workers, observability), **AI** (NoBC OS MCP server V1.5, House Phone migration, agentic eval harness), **Integrations** (calendar sync, CRM, Producer Phase K+), **Sales & Growth** (referral program, public event pages, SEO).
```
