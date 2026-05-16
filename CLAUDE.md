# NoBC OS — Claude Code Reference

## What This Is
NoBC OS is the member-facing platform for No Bad Company — a premium curated member club and event operator. It handles member applications, approvals, event RSVPs, ticketing, wallet passes, and check-in. It is part of a three-layer stack alongside Producer (operator-facing event ops, on Replit) and a Runtype + Tenur AI layer.

**Tenant Zero is NoBC.** The platform is built multi-tenant from day one to sell as SaaS to other premium member clubs and event operators (Soho House-tier target).

---

## Stack
- **Framework:** Next.js 15, App Router, TypeScript, Tailwind CSS
- **DB:** Postgres on Neon (serverless, pooled connection) + Prisma 7
- **Auth:** Clerk with Organizations (org = workspace = tenant)
- **Email:** Resend (transactional only — welcome, approval, event confirmations)
- **Payments:** Stripe (authorize/capture pattern, test mode until compliance pages live)
- **AI:** Claude Sonnet 4.6 via Vercel AI SDK (direct API calls for tagging/inference)
- **Agent runtime:** Runtype (V1.5 - master agent + House Phone sub-agent)
- **Deploy target:** Vercel

---

## Absolute Rules

### No Twilio. Ever.
NoBC OS never calls Twilio directly. All SMS flows through the House Phone, which is the Communications sub-agent inside Runtype. If a feature needs SMS: trigger Runtype. If Runtype is unavailable: degrade gracefully to email or queue for retry. Do not add the Twilio SDK. Do not add a Twilio env var. This is non-negotiable.

### Workspace scoping is the security boundary
Every read and every write is workspace-scoped. `workspaceId` is on every user-data table, indexed, and checked on every query. No exceptions.

### No hex literals in components
All colors are CSS variables. Follow Producer's pattern: `bg-primary`, `text-text-primary`, semantic tokens only. The theme system must support white-labeling for multi-tenant SaaS.

### Schema changes: generate then push manually
Run `prisma generate` first. Show the diff. Never auto-push. Producer is on the same Postgres instance and schema changes are production-affecting.

---

## Architecture: How the Three Layers Connect

```
Producer (Replit) ←→ NoBC OS (Vercel) via Phase J HMAC webhook
    Both connect to same Postgres (Neon)
    
NoBC OS → Runtype Master Agent → House Phone (Communications sub-agent) → Twilio
    NoBC OS never calls Twilio directly
    
House Phone reads member data via NoBC OS MCP (V1.5)
Inbound SMS replies → Runtype webhook → write back to NoBC OS via MCP
```

**Phase J webhook:** Producer already has `/api/webhooks/nobc-os/event-notify` live. When NoBC OS publishes/updates/cancels an event, fire a HMAC-signed POST to that endpoint. Secret: `PRODUCER_WEBHOOK_SECRET` env var.

---

## House Phone (Communications Sub-Agent)

- Lives inside Runtype, not in NoBC OS code
- Built by Nathan Booker, currently on Nathan's Runtype account (migrating to Adam's in V1.5)
- Transport: Twilio (green bubbles, decision locked)
- Interface: Slack (operator MVP), web app (long-term)
- V1: NoBC OS ships email-only. SMS welcome deferred to V1.5.
- V1.5: House Phone migrates to Adam's Runtype account, reads member data from NoBC OS MCP, inbound RSVP via SMS writes back to RSVP records

---

## V1 Scope (20 items, 8-10 weeks)

| # | Item | Status |
|---|---|---|
| 1 | Branded `/apply` form (Next.js, mobile-first, NoBC visual identity) | pending |
| 2 | Postgres + Prisma schema with all NoBC OS models | ✅ done |
| 3 | Clerk auth + workspace integration | ✅ done |
| 4 | Approval workflow + welcome email (Resend only - no SMS) | pending |
| 5 | AI tagging on application submit (Claude Sonnet 4.6, Vercel AI SDK) | pending |
| 6 | Branded `/m/events` calendar + `/m/events/[slug]` detail pages | pending |
| 7 | RSVP system (open / ticketed / apply_or_pay + sub-modes) | pending |
| 8 | `approval_required` toggle | pending |
| 9 | Stripe payments with authorize/capture | pending |
| 10 | Operator-triggered refund system (Stripe API direct) | pending |
| 11 | Apple Wallet + Google Wallet passes (PassKit.com or PassNinja) | pending |
| 12 | Offline-first QR check-in PWA (IndexedDB + Dexie.js + Workbox) | pending |
| 13 | Custom question builder per event (6 field types) | pending |
| 14 | Capacity + waitlist with auto-promotion | pending |
| 15 | Plus-ones (per-event toggle) | pending |
| 16 | Red List + duplicate handling on application submission | pending |
| 17 | NoBC OS MCP server (V1 read tools + critical write tools) | pending |
| 18 | AI chat panel (Runtype master agent, fallback to direct Vercel AI SDK) | pending |
| 19 | AI Event Builder (text only - titles, descriptions, run of show) | pending |
| 20 | `audit_events` table + Svix webhook system + WCAG 2.2 AA via Radix UI | pending |

**V1.5 gate:** 3+ events run through platform live, full apply→approve→event→check-in lifecycle complete, first member completes full lifecycle, Stripe Live Mode activated.

---

## Schema Models (Live on Neon)

All workspace-scoped with `workspaceId` indexed:

- **Workspace** - tenant boundary
- **Member** - approved members, links to DirectoryPerson
- **Application** - application workflow with AI enrichment fields
- **Event** - NoBC-facing events with accessMode/approvalRequired/plus-ones
- **RSVP** - all access modes, Stripe payment fields, check-in fields, wallet pass fields
- **AuditEvent** - full audit trail with actorType enum

**Deferred models** (add when features need them, not before):
- MembershipTier, SponsorBrandProfile, GeneratedAsset, WalletPass entity

---

## Key Files

```
prisma/schema.prisma     — all models
prisma.config.ts         — Prisma 7 config with Neon adapter (datasource nested, path.resolve)
lib/db.ts                — PrismaClient singleton via PrismaNeon adapter
lib/auth.ts              — getOrCreateWorkspaceForUser + requireWorkspaceId
middleware.ts            — Clerk protecting /m/* and /operator/*
```

---

## Environment Variables

Required now:
- `DATABASE_URL` — Neon pooled connection string (has `-pooler` in hostname)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_APP_URL`

Fill in when feature lands:
- `RESEND_API_KEY` — Step 3 (approval workflow)
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — Step 9 (payments)
- `RUNTYPE_API_URL` — V1.5 (House Phone integration)
- `PRODUCER_WEBHOOK_URL` — Phase J outbound (event publish sync to Producer)
- `PRODUCER_WEBHOOK_SECRET` — HMAC secret shared with Producer

---

## Design System

Follow Producer's conventions:
- Warm grays for bg/border, indigo primary, green/amber/red semantics
- All colors as CSS variables — no hex literals in components
- Editorial New or Playfair Display for headlines, Inter/Geist for data
- Radix UI primitives for accessible components (required for WCAG 2.2 AA - V1 item 20)
- Rounded corners: 6-8px on cards, 4px on buttons
- Lucide React for icons

---

## Routing

```
/apply                  ← public application form
/m/events               ← member-facing event calendar
/m/events/[slug]        ← member-facing event detail (Clerk-gated)
/e/[slug]               ← public event page — guest RSVP, no login required
/check-in/[slug]        ← staff check-in PWA
/operator/*             ← operator dashboard (protected)
/api/apply              ← application submission
/api/rsvp               ← RSVP submission
/api/check-in/*         ← check-in handlers
/api/webhooks/nobc/*    ← inbound webhooks (Clerk, Stripe, Runtype)
/api/agent              ← operator AI chat
/api/mcp                ← NoBC OS MCP server
/api/stripe/*           ← Stripe webhooks
```

---

## Key Architectural Decisions

### BrandKit System (V1 schema required)
Add BrandKit, ThemeVariant, CustomFont models to schema before building any more UI. Every UI component reads from BrandKit CSS variables - no hex literals ever. All colors, spacing, typography are tokens. This is the constraint-creativity system. Details in NoBC_Platform_Master_Spec_v2_2_BrandKit_Addendum.md.

### Form Engine (not hardcoded forms)
Application forms are config-driven via lib/apply-config.ts. Future: operator edits forms via UI. Same engine powers membership applications, event-specific applications, vendor applications. Template engine in V1.2.

### Email Template System (V1.2)
All email copy lives in lib/email-templates.ts as typed functions. No hardcoded strings in API routes. Operator edits email copy via UI in V1.2.

### No Twilio Ever
All SMS through Runtype House Phone sub-agent. NoBC OS never imports Twilio SDK.

### Tool Rules
Claude Code = backend only (schema, API, auth, email, server logic, anything without JSX).
Cursor = frontend only (pages, components, styling, anything that renders in browser).
When finishing a backend task that needs a UI built next, always say "Switch to Cursor now" and describe what to build.

### V1 Scope Status
1. /apply form - DONE
2. Schema - DONE
3. Clerk auth - DONE
4. Approval workflow + welcome email - IN PROGRESS
5. AI tagging on submit - PARTIAL (runs in apply API route)
6. Events calendar + detail pages - PENDING
7. RSVP system - PENDING
8. Approval required toggle - PENDING
9. Stripe payments - PENDING
10. Refund system - PENDING
11. Wallet passes - PENDING
12. Check-in PWA - PENDING
13. Custom question builder - PENDING
14. Capacity + waitlist - PENDING
15. Plus-ones - PENDING
16. Red list + duplicate handling - DONE (in apply route)
17. NoBC OS MCP server - PENDING
18. AI chat panel - PENDING
19. AI Event Builder - PENDING
20. Audit events + webhooks + WCAG - PENDING

### Validation System (add to apply-config.ts)
Each question should support: required, minLength, maxLength, minWords, pattern. Inline feedback on blur. Character counter on textareas. Not yet built - add when next touching the form.

### V1.2 Hardening Pass (after V1 ships)
Email template editor, event page template engine, custom font upload, Brand Builder wizard, starter template library, operator notification settings, bulk application actions, CSV exports.

### V1.5 Gate
3+ live events, full apply→approve→event→check-in lifecycle, Stripe Live activated, first paying SaaS customer signed.

---

## Production Readiness

The work to cross from "V1 built" to "live with real members and real money." This is the
bridge between the V1 build-out and the V1.5 Gate above — the V1.5 Gate cannot be met until
these are done. Grouped by area; each item carries a rough size (S / M / L).

### Auth — promote Clerk, do NOT replace it
Clerk is wired through ~15+ files (`clerkMiddleware`, `auth()`, `clerkClient()`, `ClerkProvider`,
the Workspace=Org mapping). The fix for the dev-instance friction is a production instance, not
a migration off Clerk. Migrating to another provider is weeks of work for no real gain.
- [ ] Create a Clerk **production instance** on a real domain; add DNS (CNAMEs for `clerk.` / `accounts.`). — M
- [ ] Swap to `pk_live_…` / `sk_live_…` in Vercel production env. — S
- [ ] Build real `/sign-in` + `/sign-up` pages (referenced today, currently 404). — M
- [ ] Add a Clerk webhook → sync Clerk users into the `Member` table (only Stripe has a webhook today). — M
- [ ] Decide member onboarding: operator-invites-to-org vs. auto-create workspace on signup. — M
- Note: event guests already skip login via the public `/e/[slug]` route — this is members/operators only.

### Payments — go live
- [ ] Stripe live keys + live webhook endpoint + `STRIPE_WEBHOOK_SECRET`. — S
- [ ] Terms / Privacy / Refund policy pages — Stripe requires these before live mode. — M
- [ ] Verify the `capture-payments` cron behaves under live mode. — S

### Infrastructure & deploy
- [ ] Custom domain on Vercel (replace `nobc-os.vercel.app`). — S
- [ ] All env vars set in Vercel production scope (DB, Clerk live, Stripe live, Resend, PassNinja, R2/S3, `NEXT_PUBLIC_APP_URL`). — S
- [ ] Git workflow: `main` = production, feature branch → preview → merge. No more `gitDirty` CLI deploys. — S
- [ ] Prisma migrations with history (replace `db push`); confirm DB backups. — M

### Correctness & safety
- [ ] Green `next build` + lint enforced in CI on every PR. — M
- [ ] Rate limiting / bot protection on the public `/e/` route and guest RSVP API — new abuse surface. — M
- [ ] Error tracking (Sentry); stop swallowing errors in empty `catch {}` blocks. — M
- [ ] Workspace-scoping audit — confirm every read and write is workspace-scoped. — M

### Polish & content
- [ ] Real landing page at `/` (currently the create-next-app placeholder). — M
- [ ] Resend: verify the `thenobadcompany.com` sending domain (SPF / DKIM / DMARC). — S
- [ ] PassNinja production account + certs for Apple/Google wallet passes. — M
- [ ] Smoke tests for apply → RSVP → payment → check-in (none exist today). — L

**Highest leverage first:** Clerk production instance + Stripe live + a custom domain. That is
the difference between "demo" and "real."
