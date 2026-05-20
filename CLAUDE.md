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
- **AI:** Claude Sonnet 4.6 via Vercel AI SDK
- **Agent runtime:** Runtype (V1.5)
- **Deploy:** Vercel

---

## Locked Decisions (NEVER override)

These are hard constants. Any agent that violates them is broken.

- **Email `from` address:** `team@thenobadcompany.com` — always, every transactional email, every welcome, every notification
- **AI model:** `claude-sonnet-4-20250514` — every Anthropic call. Do not substitute a different model, do not "upgrade" to a newer version, do not swap to a cheaper one. Adam decides model bumps explicitly.
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

Five operator roles. Permissions are enforced at the API layer; UI hide/disable is for UX, not security.

- **owner** — full access including workspace settings and billing
- **admin** — full access except billing and workspace deletion
- **manager** — approve/reject applications, create/publish events, view intelligence, issue comps
- **staff** — check-in PWA only
- **readonly** — view applications, events, intelligence; no writes

Rules:
1. Every operator API route is permission-gated. 403 on failure.
2. Every permission check writes an AuditEvent.
3. UI hides or disables unauthorized actions but the API is the real security boundary.

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

---

## Absolute Rules (apply to every stage)

### No Twilio. Ever.
NoBC OS never calls Twilio directly. All SMS flows through the House Phone (Communications sub-agent in Runtype). If a feature needs SMS: trigger Runtype. If Runtype is unavailable: degrade gracefully to email or queue for retry. Do not add the Twilio SDK. Do not add a Twilio env var.

### Workspace scoping is the security boundary
Every read and every write is workspace-scoped. `workspaceId` is on every user-data table, indexed, and checked on every query. No exceptions.

### No hex literals in components
All colors are CSS variables. Semantic tokens only: `bg-primary`, `text-text-primary`. The theme system supports white-labeling for multi-tenant SaaS.

### Schema changes: generate then push manually
Run `prisma generate` first. Show the diff. Never auto-push. Producer is on the same Postgres instance — schema changes are production-affecting.

### Mandatory closing checklist (every task)

Before you tell me a task is complete, you MUST perform this checklist on the stage's CONTEXT.md:

1. Update **Last updated** to today's date (YYYY-MM-DD)
2. Update **State** if it changed (⚪ → 🟡 → ✅ or → 🔴)
3. Update **Next** with the literal next action — be specific, not "continue building"
4. Update **Blocked on** if a new blocker appeared, or set to "Nothing" if a blocker cleared
5. Update **Files in play** if new files were added to the stage

If you report task completion without performing this checklist, the task is incomplete. Treat this rule as you would a failing test — you cannot ship without it.

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
| 07 | `_context/07-operator-dashboard/` | ✅ Shipped | #20, #22, #24, #28 |
| 08 | `_context/08-mcp-server/` | 🔶 Partial | #17 |
| 09 | `_context/09-ai-chat/` | ✅ Shipped | #18 |
| 10 | `_context/10-ai-event-builder/` | 🔶 Partial | #19 |
| 11 | `_context/11-producer-integration/` | ✅ Shipped | #20, #26, House Phone trigger (V1.5) |
| 12 | `_context/12-intelligence/` | ✅ Shipped (base) / 🔶 sponsor-facing partial | #27 |
| 13 | `_context/13-dev-tooling/` | ✅ Shipped (internal) | — |

---

## Environment Variables (always-required)

- `DATABASE_URL` — Neon pooled connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL`
- `ANTHROPIC_API_KEY` — application archetype scoring + personalization

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
