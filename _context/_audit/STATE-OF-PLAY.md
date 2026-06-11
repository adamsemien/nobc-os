# State of Play — Resume Here

> **If you are a fresh Claude Code session, read this first.** It is the live
> handoff for the in-flight security + strategy work. Single owner: the "Apex /
> security-and-strategy" session (Opus 4.8). Last updated: **2026-06-09**.
> Update this file whenever the state below changes — it is the resume point.

---

## 1. What just shipped (merged to `main`, 2026-06-09)

The overnight audit (warden + zero + apex eval) remediation is **fully merged**.
`main` is at/after commit `c0199f7`. Seven PRs:

| PR | Ships | Audit finding |
|---|---|---|
| #50 | membership + event-hero uploads → **private R2** | H1 / WARNING-9 (IDOR) |
| #51 | `/api/mcp` Clerk-session path **role-gated, default-deny to STAFF** | **C1** (CRITICAL) |
| #53 | producer-webhook verifies **workspace ownership** | H3 |
| #59 | check-in uses **event-scoped signed tokens** (killed the browser `CHECKIN_SECRET`) | H2 |
| #60 | slug-less apply resolves tenant **deterministically** (env `APPLY_DEFAULT_WORKSPACE_ID` → oldest fallback) | M2 |
| #61 | **CI gate** (`.github/workflows/ci.yml`): tsc + vitest + build + lint on every PR | durability |
| #62 | strategy doc + Phase 0 mitigation docs + CLAUDE.md pointer | strategy |

**The entire CRITICAL + HIGH tier is closed.** CI now guards `main`.

## 2. The strategy thesis (where the product is going)

Source of truth: **`_context/_audit/PRODUCER-OPERATOR-STRATEGY.md`** — read §10 (thesis
v2), which supersedes §9.

- **Wedge:** product **indispensability** for **local, fast-paced growing event brands**
  (NOT enterprise luxury, NOT intelligence-led). "The tool they can't imagine doing an
  event without."
- **Constituencies, sequenced:** creators (primary, founder-led) → members/guests
  (bottom-up growth — must beat Lu.ma/Posh on experience) → sponsors (fast-follow).
- **Means:** converge Producer (back-of-house: vendors/SOW/run-of-show) + Operator
  (front-of-house: member page/portal/registration) into **one shared community-CRM
  spine** (member/guest/vendor/sponsor = roles, not separate tables).
- **Ratings (2026-06-09):** thesis v2 = **8/10**; current build vs. thesis = **6/10**
  (operator half strong + live; the moat — converged spine + comms-intelligence — barely
  built). Path to 9: pick lead segment, converge the spine, prove ONE cross-layer payoff
  with a real customer, name the revenue model.

### Critical factual correction (verified 2026-06-09)
The "**Producer and Operator share one Postgres**" claim in CLAUDE.md and older docs is
**contradicted by live config**: separate databases (Producer dev → `helium/heliumdb`;
NoBC → Neon `ep-twilight-forest-…`) and **separate Clerk apps** (Producer `firm-weevil-76`
/ key `maximum-chipmunk-4`, NO prod env; NoBC `allowed-zebra-34` dev / `app.thenobadcompany.com`
prod). Producer is effectively a **standalone, dev-stage tool**; the only link is a one-way
event webhook + Airtable RSVP counts. **One fact still unverified:** Producer's *production*
`DATABASE_URL` (Doppler prod). Until confirmed, treat "shared Postgres" as false.

## 3. Agents dispatched (2026-06-09) — lanes, no collisions

Each owns a distinct surface and PRs to its own branch — **none merge without Adam.**

| Agent | Task | Branch (PR, no-merge) |
|---|---|---|
| **crest** | Decide thesis v2: wedge, narrowest end-to-end slice, segment sequence, **revenue model**, confirm convergence. Appends "§11 — Decision" to the strategy doc. **Gates the build.** | `docs/crest-decision` |
| **proof** | Money-path (Stripe) + access-gate test coverage; make capacity/waitlist counters transactional (race fix). Stays OUT of `lib/mcp`. | `test/money-path-coverage` |
| **draft** | Read-only UX friction audit of member-facing flows vs Lu.ma/Posh → `_context/_audit/UX-FRICTION-AUDIT.md`. No code. | `docs/ux-friction-audit` |
| **warden** | Design (+ maybe implement) auth for the `/api/mcp` **Bearer** write path (the one gap #51 didn't cover) → `_context/_audit/MCP-BEARER-AUTH-DESIGN.md`. | `fix/mcp-bearer-auth` |
| Replit/Producer chat (not tonone) | Confirm Producer **prod** `DATABASE_URL` + `?schema=`; adopt the `db push` ban; reconcile `firm-weevil-76` vs `maximum-chipmunk-4`. | — |

## 4. Open gates / what's blocked on what

- **The build is gated on crest's decision.** Once crest names the wedge + narrowest
  slice, the owner starts building it (that's the next time code gets written here).
- **Phase 0 last gate:** Producer's prod `DATABASE_URL` (Replit chat).
- **flux #57** (`chore/reconcile-migration-history`) — Operator's own migration-history
  reconciliation, **file-only done, awaits Adam's `migrate resolve` in a coordinated
  window.** Still valid even though Producer is a separate DB (it's Operator-internal).
  Do NOT let any agent re-author this — it exists.
- **G6 / RLS** (zero's tenant-isolation multiplier) — gated on the convergence decision
  + the Producer window. Not started.
- **Migration-drift CI guard** — deferred until flux #57 lands (would false-positive on
  current drift).

## 5. Other open PRs (triage backlog, NOT this session's stack)

`#58` (DAM tag fail-closed + wallet token), `#57` (flux, above), `#46 #48 #52 #54 #55 #56`
(pre-session, untriaged). Owner to triage when the active lanes clear.

## 6. Ownership + working rules

- **Single owner** of: Operator security/correctness, `PRODUCER-OPERATOR-STRATEGY.md`,
  this STATE doc, merge management, and the eventual convergence build.
- Work happens in **git worktrees** under `.claude/worktrees/` (branch per concern).
  New worktree deps: symlink `node_modules` + `.env.local` from repo root. Verify with
  `node_modules/.bin/tsc --noEmit` + `node_modules/.bin/vitest run` (Turbopack build
  fails on cross-root symlinks — use `node_modules/.bin/next build` (webpack) locally).
- **Hard rules (unchanged):** never `prisma db push` (shared/▲ schema; use additive
  `migrate diff` → `db execute`, file-only, Adam runs DB steps); `npx prisma` broken →
  `node node_modules/prisma/build/index.js`; locked AI model `claude-sonnet-4-20250514`;
  email from `team@thenobadcompany.com`; never touch `/apply` screen-7 legal copy or
  archetype config; workspace-scope every query; semantic tokens only (no hex);
  terminology law (Access not RSVP, etc.); branch per concern; **no merge without Adam**
  (the owner may merge with Adam's standing authorization — confirm per batch).

## 7. Immediate next actions (for the owner)

1. Finish updating CLAUDE.md stale facts (this PR).
2. When crest's decision lands → read it, then build the narrowest slice.
3. When Replit returns the prod `DATABASE_URL` → close Phase 0, update §2 above.
4. As proof/draft/warden PRs land → review, verify (tsc + tests green), merge.
