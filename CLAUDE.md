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
| 02 | `_context/02-approval/` | 🟡 In progress | #4, #16 |
| 03 | `_context/03-events/` | ⚪ Not started | #6, #13, #14, #15 |
| 04 | `_context/04-rsvp/` | ⚪ Not started | #7, #8 |
| 05 | `_context/05-payments/` | ⚪ Not started | #9, #10 |
| 06 | `_context/06-wallet-checkin/` | ⚪ Not started | #11, #12 |
| 07 | `_context/07-operator-dashboard/` | ⚪ Not started | #20 |
| 08 | `_context/08-mcp-server/` | ⚪ Not started | #17 |
| 09 | `_context/09-ai-chat/` | ⚪ Not started | #18 |
| 10 | `_context/10-ai-event-builder/` | ⚪ Not started | #19 |
| 11 | `_context/11-producer-integration/` | ⚪ Not started | Phase J, House Phone trigger |

---

## Environment Variables (always-required)

- `DATABASE_URL` — Neon pooled connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL`
- `ANTHROPIC_API_KEY` — application archetype scoring + personalization

Stage-specific env vars live in each stage's `CONTEXT.md`.

---

## Design tokens (always-loaded)

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
