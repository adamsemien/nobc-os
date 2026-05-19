# NoBC OS

Member platform for No Bad Company — handles applications, approvals, event RSVPs, ticketing, and check-in. Built multi-tenant from day one; Tenant Zero is NoBC. The platform sits alongside Producer (operator event ops, on Replit) and a Runtype AI agent layer, all sharing the same Postgres database.

---

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15, App Router, TypeScript, Tailwind CSS v3 |
| Database | Postgres on Neon (serverless, pooled) + Prisma 7 |
| Auth | Clerk with Organizations (org = workspace = tenant) |
| Email | Resend — always from `team@thenobadcompany.com` |
| Payments | Stripe (authorize/capture pattern) |
| AI | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Deploy | Vercel — `vercel deploy --prod` |

---

## Local Setup

```bash
git clone <repo>
cd nobc-os
npm install
cp .env.example .env.local   # fill in values — see section below
npx prisma generate
npm run dev
```

App runs at `http://localhost:3000`.

### Required Environment Variables

```
# Database
DATABASE_URL                        # Neon pooled connection string (-pooler in hostname)

# Auth (Clerk)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET

# App
NEXT_PUBLIC_APP_URL                 # e.g. http://localhost:3000

# Email
RESEND_API_KEY

# Payments (Stripe)
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET

# Webhooks
SVIX_SECRET
PRODUCER_WEBHOOK_URL
PRODUCER_WEBHOOK_SECRET

# AI
ANTHROPIC_API_KEY
```

> Schema changes: run `prisma generate` first, review the diff, then push manually. Producer shares the same Postgres instance — never auto-push.

---

## Key Directories

```
app/
  apply/                  Public membership application form (9-screen cinematic flow)
  m/                      Member-facing pages (events calendar, event detail, wallet pass)
  operator/               Operator panel — applications, events, intelligence, settings
  check-in/               Staff check-in PWA (offline-first, QR scanner)
  api/                    All API routes

lib/
  db.ts                   PrismaClient singleton (Neon adapter)
  auth.ts                 getOrCreateWorkspaceForUser + requireWorkspaceId
  permissions.ts          checkPermission(userId, action) — role-based access
  scoring.ts              Question-agnostic AI scoring (archetype + dimensions)
  event-access.ts         Event access resolution and gate logic
  audit.ts                AuditEvent writer
  theme.ts                7-theme system config
  producer-webhook.ts     Phase J HMAC webhook to Producer

prisma/
  schema.prisma           All models

config/
  archetypes.ts           6 archetype definitions (Connector, Host, Curator, Builder, Maker, Patron)

middleware.ts             Clerk: protects /m/* and /operator/*
app/globals.css           All CSS variables and theme token values (no hex in components)
```

---

## Architecture

```
Producer (Replit) ←→ NoBC OS (Vercel)
    Both hit the same Neon Postgres

NoBC OS → Runtype Master Agent → House Phone (sub-agent) → Twilio
    NoBC OS never calls Twilio directly

House Phone reads member data via NoBC OS MCP (/api/mcp)
```

Inter-service events fire as HMAC-SHA256-signed webhooks (`X-NoBC-Signature`). Fire-and-forget, one retry, logged to `AuditEvent`.

---

## V1 Status

26 of 28 items complete.

**Done:** application form + AI scoring, approval workflow, member event calendar, RSVP system (open/ticketed/apply-to-attend), Stripe authorize/capture, refund system, offline-first check-in PWA, custom registration fields, capacity + waitlist, plus-ones, red list, comp tickets, operator AI chat (Cmd+K), AI event builder, audit log, 7-theme system, WCAG 2.2 AA, roles + permissions, Producer Phase J webhook.

**Partial:**
- Item 11 — Apple/Google Wallet passes (routes scaffolded, PassNinja account pending)
- Item 17 — MCP server (`/api/mcp` live, toolset incomplete)

**Near-term:**
- Wallet passes (Item 11) once PassNinja is set up
- MCP server tool completion (Item 17)
- Question builder UI (`/operator/settings/questions`)
- Application template builder UI (`/operator/settings/applications`)
- Per-theme font loading (themes currently change colors only)

---

## Full Build Context

See [`CLAUDE.md`](./CLAUDE.md) for the complete reference: schema models, routing table, role definitions, canonical terminology, design system rules, and coding constraints.
