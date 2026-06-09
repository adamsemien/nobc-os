# Producer ↔ Operator Architecture — Decision & Handoff

> **For a fresh Claude Code session.** This is the source of truth for the
> Producer/Operator integration decision. Read it fully before touching any
> cross-app or schema code. Strategy owner: Adam. Drafted 2026-06-09.

---

> ## ⚠️ 2026-06-09 UPDATE — CORE PREMISE CONTRADICTED BY LIVE CONFIG (read first)
>
> This doc's load-bearing factual claim — that Producer and Operator **share one
> Postgres and infrastructure** (§2, §4) — is **not backed by the live config.**
> Verified the same day from both sides:
>
> - **Clerk: SEPARATE — confirmed (dashboard + key decode).** Two distinct Clerk
>   *applications*. NoBC OS → `allowed-zebra-34` (dev) and `app.thenobadcompany.com`
>   (**Production / live**). Producer → `firm-weevil-76` in the Clerk dashboard,
>   **No Production Environment**; the publishable key in Replit's env decodes to a
>   *different* instance, `maximum-chipmunk-4`. No shared identity; Producer has no
>   Clerk prod instance at all. (The `firm-weevil-76` vs `maximum-chipmunk-4`
>   mismatch is its own reconciliation item.)
> - **Neon (dev): SEPARATE.** Producer's configured `DATABASE_URL` → `helium/heliumdb`
>   (Replit-managed Postgres), NOT NoBC's `ep-twilight-forest-…neon.tech`.
> - **Producer ≈ a standalone, dev-stage tool.** Own login, own DB, own tenancy, no
>   Orgs. Only link to NoBC = the one-way inbound event webhook + Airtable RSVP counts.
>
> **One fact still unverified:** Producer's *production* `DATABASE_URL` (Doppler
> prod). But Producer has **no Clerk prod environment**, so a real prod deploy may
> not exist yet. Until confirmed, treat "shared Postgres" as **false in every
> environment we can see.**
>
> **Implications:**
> 1. The §4 "house on fire" `db push` landmine is **NOT active** in the verified
>    environments — different databases can't drop each other's tables. The
>    companion `PHASE-0-PRODUCER-DB-PUSH-MITIGATION.md` is downgraded from
>    emergency to cheap insurance.
> 2. The destination below (shared core + two role-scoped surfaces) may still be
>    the right *goal*, but it is a **greenfield merge of two separate systems** —
>    real cross-DB data migration + Clerk consolidation — NOT the "untangle a
>    shared DB" refactor this doc assumes. The CRM/Event "spine" phases are bigger
>    than sized here; re-scope before committing.
> 3. There is **no fire**, so the strategy can be designed deliberately rather than
>    under the §8 "don't design the marriage while the house is on fire" urgency.

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

> Note (2026-06-09): §4's "house on fire" premise is contradicted by live config —
> see the top banner. Phase 0 is downgraded to a confirmation step, not a fire drill.

---

## 9. The product thesis — pressure-tested (2026-06-09)

The full vision, stated by Adam and stress-tested. **This is the honest version
crest should decide against — not the optimistic "member club OS" framing.**

### 9.1 The thesis (4-layer dependency stack, one spine)

It is not "member club software." It is **the operating system for people who
gather other people** — and the layers form a *dependency stack*, each the moat
for the one above:

```
3. SPONSOR MONETIZATION   ← the revenue. Sponsors pay to reach a known, measured community.
        ▲ only possible because of…
2. INTELLIGENCE           ← cross-everything insight ("better intelligence around all parts").
        ▲ only possible because of…
1. UNIFIED EXECUTION      ← Producer (back-of-house) + Operator (front-of-house) as one.
        ▲ only possible because of…
0. COMMUNITY/RELATIONSHIP CRM SPINE  ← one graph; member/guest/vendor/sponsor = roles, not tables.
```

Membership is a **mode**, not the foundation — the spine is a *community/relationship*
graph (Adam's first company "had a community, not a membership"). The same producer
logic serves both member clubs **and** non-membership event producers (supper-club
series, festivals, promoters, experiential agencies). Breadth is intended as the
moat, because no competitor spans the stack.

### 9.2 What the architecture got backwards (the root of Adam's conflict)

Today's split is by **audience**: Producer = back-of-house (vendors, contacts,
coordination), Operator = consumer-facing (member page, portal, registration,
photos). Intuitive — but **the relationship graph cuts *across* that line.** A
sponsor is both (back: contract; front: logo on the member page); a person can be
member *and* vendor. The audience-based split **fragments the single connected
graph that the thesis says is the crown jewel.** The way it's built works against
what makes it valuable → this is the strongest internal argument for convergence.

### 9.3 Four holes (must survive these to be real)

1. **"Breadth is the moat" is also the platform trap.** Integrated-but-mediocre
   loses to best-in-class point tool + Zapier — UNLESS the *connection between
   layers* delivers value integrations can't fake. Unproven by a paying customer.
   (§9.5 is the proposed answer to this hole.)
2. **Two-segment TAM is a launch risk, not an asset.** Clubs vs non-membership
   producers = different buyers, motions, priorities. Breadth is the *expansion*,
   not the *wedge*. Pick one to win first.
3. **Sponsor monetization is the strongest differentiator AND the weakest SaaS
   link.** Gold for NoBC (who has sponsor relationships); may not transfer as a
   SaaS promise to tenants who can't sell sponsorships. Shakiest assumption.
4. **Convergence has real cost** — porting Producer off its Replit/Express/Drizzle/
   Gemini stack, paid before the moat exists, by a small team.

### 9.4 Rating (with full picture)

| Dimension | Score |
|---|---|
| Vision / thesis | 8 |
| Market opportunity | 7 |
| **Current build vs. the thesis** | **5.5** — Operator mature & in prod; Producer dev-stage & disconnected; the *differentiating layers* are the least built |
| Strategic clarity | 6 |
| Defensibility *if executed* | 8 (high ceiling, discounted as unproven) |

**Blended ≈ 7 for the venture, ≈ 6 for the build.** Excellent operator platform +
real vision, but the moat (connected spine + intelligence + sponsor layer working
*together*) barely exists yet. Path to 9: (1) pick one lead segment [lean: premium
curated clubs]; (2) converge the spine; (3) prove ONE cross-layer payoff with a
real customer; (4) de-risk the sponsor-SaaS assumption.

### 9.5 What makes it a 10 — the unified comms + vendor-ops intelligence layer

Adam's "10": **capture the communication layer of the event supply chain against
the relationship graph, without forcing counterparties to adopt the tool.**

- **Ingest, don't impose.** When a vendor emails, it's seen and logged in the
  platform. Pull in Google Docs/Sheets; surface them in-tool. You do NOT make
  every vendor/venue adopt your software — you **unify comms + insight for the
  person who has the tool**, and the value accrues to them. This sidesteps the
  impossible "get everyone on the platform" problem and directly solves the real
  pain: *"different systems, we communicate through email, it's lost in translation."*
- **Then derive operational intelligence** the relationship graph alone can't give:
  vendor **response time**, reliability / "how good people are," relationship health.
- **Then operate on it:** fast **onboarding/offboarding** (hospitality is high-turnover,
  vendors included), and **relationship campaigns** (favorites, reminders, holiday gifts).

**Why this matters strategically:** §9.5 is the direct answer to hole #1 (§9.3).
Unified comms + intelligence over a single relationship graph is **cross-layer value
that point tools + Zapier cannot replicate** — it requires the unified graph AND the
comms capture together. The more comms flow through it, the better the data and the
higher the switching cost → a genuine **data moat + network effect**. This is the
layer that turns "integrated but mediocre" into "integrated and uniquely intelligent,"
and it is likely the true differentiator of the whole platform.

- **Proof of pattern already in-house:** the **House Phone** SMS inbox
  (`_context/14-house-phone`) is exactly this pattern for one channel — ingest an
  external comms stream, log it, derive intelligence (categorization/analytics).
  Email + docs are the same move on new channels.
- **Honest risks (stay skeptical):** comms ingestion is a deep, ongoing build with
  real **privacy/consent** weight (logging counterparties' email); response-time /
  reliability scoring needs comms *volume* to be useful; and it is *another* large
  surface — it sharpens holes #2 and #4 (scope, execution load on a small team).

### 9.6 The decision for crest

Decide against §9.1–9.5, not the optimistic framing: (a) is the broad "OS for people
who gather people" wedge defensible vs a focused "premium curated clubs" wedge —
bigger TAM vs sharper story; (b) confirm Producer+Operator convergence into one
shared-CRM platform; (c) lead segment, lead layer, ship sequence; (d) is the §9.5
comms-intelligence layer the lead differentiator, or a later moat-deepener; (e)
de-risk or reposition the sponsor-as-SaaS assumption. Competitive teardowns: Lu.ma,
Glue Up, Peoplevine, SevenRooms, Tripleseat, Planning Pod.

---

## 10. Thesis v2 — sharpened by Adam (2026-06-09). SUPERSEDES the framing above.

§9 framed the wedge as the intelligence/sponsor stack. Adam course-corrected. This
is the current thesis; crest should decide against THIS.

### 10.1 The wedge is INDISPENSABILITY, not intelligence

> "If I make the best tool for operators and event producers — that they couldn't
> ever imagine doing an event the old way without it again — that's a HUGE win."

- **Intelligence is demoted.** "So many brands deliver analytics without insight…
  too many insights is a trap." Only **actionable insight that solves their biggest
  problem** counts. Intelligence is a *supporting* layer, not the headline.
- The driving factor is **product excellence → indispensability**, born from a real
  founder pain: *"this started because I was sick of the disjointed systems I have
  to use and pay for that do 1/10 of what I need."* Founder-market fit is the asset.

### 10.2 ICP — narrowed (important)

**NOT** Swarovski / Louis Vuitton / enterprise luxury. **Mostly local, fast-paced,
growing brands** — the mid-market creator too big for Posh, not served by (or not
able to justify) enterprise venue tools. This narrowing is a strength; hold it.

### 10.3 Three constituencies, with a sequence

1. **Event creators (primary).** "That's who I am, that's who Chloe is." Build the
   tool the founder wishes existed. Founder-led.
2. **Members / guests (the growth engine).** Make the attendee experience beat Lu.ma
   and Posh → *"if people like my experience more than Luma and Posh, the people will
   make it known."* This is **bottom-up / product-led growth** — the *proven* motion
   (it is how Lu.ma itself grew: attendee → organizer). Member experience is #1 for
   growth, deliberately.
3. **Sponsors (monetization).** Served, but should likely be a **fast-follow**, not
   co-equal at launch, or it dilutes the creator+member wedge.

### 10.4 The sharp positioning (recommended articulation)

**Lu.ma-grade front-of-house experience + the entire back-of-house production +
sponsor operation that Lu.ma/Posh will never build — for local growing brands.**
Indispensability comes from being the *only* tool that does BOTH the consumer-facing
experience and the production back-end for that mid-market creator. The moat vs Lu.ma
is not "nicer UI" (they're good, free, network-effected) — it is the production +
sponsor back-end they have no reason to build.

### 10.5 Rating of thesis v2 (vs §9.4)

**≈ 7.5–8 / 10 for the thesis** — up from ~7. The lift comes from: founder-market
fit, a focused ICP, and a *proven* bottom-up growth motion (experience → word of
mouth). **Build rating unchanged (~6)** — the execution gap is the same; v2 sharpens
the strategy, not the code.

Holes that keep it from higher:
1. **You're now fighting Lu.ma/Posh on their turf (front-of-house).** They're very
   good and free. The wedge MUST be front-parity + the back-end they lack — not
   experience alone.
2. **"Indispensable" requires breadth** (replacing the disjointed stack), which
   re-introduces the scope/execution risk. Tension: focused wedge vs indispensable-
   =-broad. Resolve by picking the *narrowest* end-to-end slice that still makes a
   creator unable to go back.
3. **Revenue model not explicit.** If growth is bottom-up/free-ish and members are
   the engine, where's early revenue — ticketing fees (Lu.ma/Posh model), creator
   subscription, or sponsor cut? Name it.
4. **Three constituencies is still a lot at once** — sequence member-led, sponsor
   fast-follow.

### 10.6 For crest — decide against v2

(a) Validate the wedge: is "the indispensable end-to-end tool for local growing
event brands (Lu.ma-grade front + production/sponsor back-end)" defensible vs Lu.ma,
Posh, Partiful, Tripleseat? (b) Define the **narrowest end-to-end slice** that makes
a creator never go back. (c) Sequence the three constituencies (member-led growth,
sponsor fast-follow). (d) Name the **revenue model**. (e) Confirm Producer+Operator
convergence as the means. Intelligence + the §9.5 comms layer are *later moat-
deepeners*, not the wedge — confirm or challenge.
