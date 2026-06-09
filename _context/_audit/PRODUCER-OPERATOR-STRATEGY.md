# Producer ↔ Operator Architecture — Decision & Handoff

> **For a fresh Claude Code session.** This is the source of truth for the
> Producer/Operator integration decision. Read it fully before touching any
> cross-app or schema code. Strategy owner: Adam. Drafted 2026-06-09.

---

## 1. What these two systems are

- **NoBC Operator** (this repo, `nobc-os`) — member-facing + operator dashboard.
  Next.js 15 / Prisma / Clerk (Orgs) / Anthropic. On Vercel. Owns: applications,
  archetype scoring, members, event **access/RSVP**, tickets, payments, member
  intelligence, sponsors (intelligence side), DAM, House Phone.
- **Producer** (separate repo, on Replit) — event **production ops**. Monorepo:
  `artifacts/producer` (Next.js 15 / Prisma) + `artifacts/api-server` (Express 5 /
  Drizzle). Clerk (DEV keys), R2, Doppler, Gemini. Owns: vendors, sponsors (ops
  side), SOWs, budget, run-of-show, tasks, checklist templates, vendor/client
  **portals**, people/company **directory**.

## 2. How they're wired today (the integration surface)

- **They SHARE one physical Postgres** (Neon, `neondb`). Confirmed from Producer's
  own brief. Each app owns its own table set; Producer is contractually walled off
  from Operator's `Member`/`RSVP`/`Ticket` tables.
- **Only shared entity = Event**, and it's *duplicated*, not shared: Operator keys
  its `Event` by `producerEventId`; Producer tags its own by `externalOriginSystem`
  / `airtableRecordId`. They sync via:
  - **Phase J bidirectional HMAC webhook.** Operator: `lib/producer-webhook.ts`
    (outbound) + `app/api/webhooks/producer/route.ts` (inbound, does
    `db.event.upsert` on `producerEventId`). Producer: `app/api/webhooks/nobc-os/event-notify`.
    Header `X-NoBC-Signature`, env `PRODUCER_WEBHOOK_URL` / `PRODUCER_WEBHOOK_SECRET`.
  - **Airtable** for RSVP *counts only* (`lib/airtable-rsvp.ts` on Producer side).
- The same real-world person/company is modeled **5+ ways**: Operator `Member` +
  `SponsorBrandProfile`; Producer `DirectoryPerson` + `DirectoryCompany` + `Vendor`
  + `EventSponsor`.

## 3. The decision

**Not "merge the apps" and not "keep them separate." Build a shared core with two
role-scoped product surfaces.** This is one platform that got built as two
codebases. Rejected: (a) two synced products — deepens existing coupling, dual
login; (b)/(c) nesting one in the other — stack collision + buries a sellable
product. Chosen: **shared spine + two surfaces.**

**The spine, in leverage order:**
1. **Identity** — one Clerk instance, Organizations = tenant, one login, role-scoped
   surfaces. Producer must drop dev keys and add RBAC (it has *none* today — hard
   SaaS blocker). Operator already has ADMIN/STAFF/READ_ONLY; extend it across both.
2. **CRM** ("the marriage") — collapse the 5+ duplicate models into canonical
   **Company + Person + Role** (member / vendor / sponsor / contact). In a premium
   club these populations overlap heavily, so this is dedup *and* a differentiator.
3. **Event** — collapse the two Event tables into **one shared-canonical table**.
   This is what lets us **delete the Phase J webhook** (it only exists because each
   app keeps its own Event row).

**Packaging / GTM:** sell as two SKUs now (Operator first → Producer next), present
as one "Club OS" once surfaces unify. Architecture is unified from the start;
pricing converges later. Target = Soho-House-tier member clubs; Tenant Zero = NoBC.

**Replit:** migrate Producer onto the Vercel/Next/Prisma/Clerk stack — but as a
*consequence* of adopting the spine (Phase 4), not first. `api-server` (Express/
Drizzle) is the last awkward remnant; retire it last.

## 4. 🔥 URGENT landmine — defuse before any schema work

Operator's `CLAUDE.md` **forbids `prisma db push`** (it drops `Asset_searchVector_idx`,
the DAM full-text GIN index, which lives only in prod via `prisma/sql/dam-search-vector.sql`).
**Producer's documented schema workflow IS `prisma db push --skip-generate`** against
the *same* DATABASE_URL. If the two apps share the same Postgres **schema** (not just
the same database), either app's `db push` can drop the other's tables.

**Action: verify Postgres schema isolation before anything else.** Check whether
Producer and Operator are in separate Postgres schemas (`?schema=` in the connection
string, or Prisma `multiSchema`) or colliding in `public`. This is a fire regardless
of strategy. If they're colliding in `public` with live cross-writes → escalate to
Adam, pause all spine work.

## 5. Hard constraints still in force (from CLAUDE.md)

- **Never `prisma db push`** in this repo. Additive changes only: edit schema →
  `prisma generate` → `prisma migrate diff` (review, refuse any DROP/ALTER TYPE/
  RENAME) → `prisma db execute --file`. Non-additive → stop, ask Adam (Producer
  shares the DB).
- **AI model locked** to `claude-sonnet-4-20250514` (Operator side). Producer uses
  Gemini — do not "unify" the model without Adam's sign-off.
- **Workspace scoping is the security boundary.** Every read/write workspace-scoped.
- **No hex literals in components**; semantic Tailwind tokens only.
- Terminology law: "Access"/"Event Access", never "RSVP" in UI. Email from
  `team@thenobadcompany.com`. Don't touch `/apply` waiver legal copy or archetype config.

## 6. Sequenced roadmap

| Phase | Bet | Proves |
|---|---|---|
| **0 — Safety** (next) | Verify/enforce Postgres schema isolation; neuter cross-app `db push` | Shared DB can't kill you while you work |
| **1 — Identity spine** | One Clerk org model across both; Producer off dev keys; shared RBAC | One login, one tenant boundary, SaaS-safe auth |
| **2 — CRM spine** | Canonical Company/Person/Role; backfill from both apps | One relationship graph (the differentiator) |
| **3 — Event spine** | Collapse two Event tables → one; **delete Phase J webhook** | Spine carries load; sync plumbing gone |
| **4 — Surfaces + packaging** | Role-scoped surfaces; module pricing; migrate Producer off Replit | "One club OS" demoable; Replit retired |
| **5 — SaaS hardening** | Per-tenant isolation tests; onboarding tenant N+1 (white-label exists) | Club #2 sellable |

GTM sells in parallel throughout — never blocked from selling while the spine builds.

## 7. Open questions / unverified assumptions

1. Do Producer (`Workspace`) and Operator (Clerk-org) tenant keys reconcile to one?
   **Unverified** — Phase 0 must also confirm tenant-id alignment.
2. Is the CRM population overlap (members ≈ sponsors ≈ vendors) genuinely heavy? If
   mostly disjoint, CRM-spine payoff shrinks and Event-only spine may suffice.
3. Confirm migrating Producer > maintaining two stacks long-term (Adam leaned yes).

## 8. Immediate next action

**Run Phase 0: the schema-isolation audit against the live Neon DB.** Do not design
the CRM-spine ADR first — don't design the marriage while the house might be on fire.
After Phase 0, hand the CRM-spine data model to a systems-architect as an ADR before
writing any migration.
