# State of Play — Resume Here

> **If you are a fresh Claude Code session, read this first.** It is the live
> handoff for the in-flight security + strategy work. Single owner: the "Apex /
> security-and-strategy" session (Opus 4.8). Last updated: **2026-06-21**.
> Update this file whenever the state below changes — it is the resume point.

---

## 0. Current shared state — 2026-06-15 (live; read before §1)

> Canonical handoff across all active sessions (Adam + multiple CC clones). Verified facts only.

### 2026-06-21 — Production recovery + Instagram Stories rollout (Opus 4.8 session)

- **Outage fixed.** `app.thenobadcompany.com` was 500ing on every DB route (`P1000`) — Vercel prod `DATABASE_URL`/`DIRECT_URL` held a stale password. Replaced with the valid Neon **production**-branch string (`ep-twilight-forest-aj09y301`) + redeployed. Verified `/e/no-bad-monday` → 200; data intact (19 events, 177 members).
- **`main`-HEAD build break fixed.** Every prod build had been failing `next build` since the Instagram-Stories commits — 3 bugs in `app/operator/media/_components/StoryGeneratorPanel.tsx`: conditional `useCallback` (rules-of-hooks), phantom `date-fns` import (never in `package.json`), `event.name`→`event.title`. Fixed on `fix/story-generator-hook`, fast-forwarded to `main` (`9f7984e`). tsc 0, preview build green.
- **Stories DB migration applied (additive, `prisma db execute`).** `InstagramStory` + `InstagramStoryBatch` tables + `StoryStatus` enum. ⚠️ The `prisma migrate diff` output included **false-drift `DROP INDEX Asset_searchVector_idx` + `Asset_embedding_hnsw_idx`** — **stripped before applying**; both DAM indexes verified still present post-migration. Reviewed + APPROVED by tonone:flux.
- **Prod credential rotated.** Old `neondb_owner` password `npg_n2VT6ikmzIOs` was exposed in-session → Adam rotated the **production** branch to `npg_B9o2RnCbHKLA`. Vercel prod `DATABASE_URL`/`DIRECT_URL` updated to the new password as **`--sensitive`** (was briefly `--no-sensitive` for verification) + redeployed; verified green. **Dev (`ep-sweet-term`) + sandbox (`ep-tiny-mode`) have independent passwords — unaffected, NOT rotated (Adam's call); the leaked old password still opens them** (non-prod data, lower risk).
- **Doc landmine fixed.** Removed the dangerous `prisma db push` instructions from `INSTAGRAM_STORIES_SETUP.md`, `DELIVERY_SUMMARY.md`, `BUILD_STATUS.md` (they'd drop the DAM indexes).
- **PROD now:** `main` @ `9f7984e`+ (full feature set incl. Stories UI live).
- **Still owed (Adam):** (1) set `INSTAGRAM_ACCESS_TOKEN` + `INSTAGRAM_BUSINESS_ACCOUNT_ID` in Vercel prod for Stories to actually post (long-lived token, ~60-day expiry); (2) optional — rotate the leaked dev Clerk `sk_test_…` + dev/sandbox Neon passwords; (3) `REPLICATE_API_TOKEN` still unset (DAM vibe search no-ops). **The §0 entry below (2026-06-15) predates this and may be stale on the DATABASE_URL line.**

---

**PROD:** `app.thenobadcompany.com` → `main` @ `2dde584` (#106/#107/#109). Event-save bug fixed (hero input `type=url` → `text`). Public event page `/e/[slug]` renders for anonymous visitors — verified live: `/e/no-bad-monday` → HTTP 200.

**IN FLIGHT**
- **`fix-guest-event-link`** (worktree; "guest-link" CC session) — base `main`@`2dde584`, isolated, **NOT committed/pushed** at time of writing. Repoints 4 operator links `/m/events/[slug]` → `/e/[slug]`: Copy Invite Link, the preview link (relabeled "Preview Public Page"), and the canonical-URL display in event settings + new-event. Member emails/links/Stripe-return URLs intentionally stay on `/m/`. **Root cause:** the public `/e/[slug]` surface was built (page + anon-guest API fallback) but **orphaned** — every share/invite link, incl. operator "Copy Invite Link", emitted the Clerk-gated `/m/events/` member URL → guest login wall. Deferred (offered, declined): anon `/m/events/[slug]` → redirect `/e/[slug]` to rescue links already shared.
- **`feat/event-access-flow-rework`** — **parked PROMPT, not a branch** (absent local + origin). No collision with `fix-guest-event-link`.
- **`agent-a594332f8fd3a05df`** @ `f794cc9` — **orphaned registration**: `~/nobc-os` dir gone; branch `f794cc9` is a 2026-05-15 commit fully merged into main (0 ahead). No live session, no unmerged work, no collision risk.

**MONEY PATH / SMOKE TEST**
- Live **$1 charge on `/e/no-bad-monday`** (incognito, logged out): **NOT YET — No.**
- Code/env green: Stripe webhook route + `StripeEvent` model + `pageStyle` field present; `CRON_SECRET`, `CHECKIN_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL` all set in Vercel prod.
- Pre-charge gates **CLOSED** (confirmed by Adam 2026-06-15): `StripeEvent` table + all 4 indexes confirmed in Neon prod; Stripe live webhook wiring (endpoint/events/signing-secret) confirmed. Both **done, not pending**.
- **Known 500s — UNFIXED:**
  - `/m/` member payment-intent route: 500s (real members, not just preview) — UNFIXED.
  - operator comp-bypass route: 500s — UNFIXED.
  - guest `/e/` Stripe create (route line ~171): no try/catch → empty-500 possible on a real charge.

**NEXT**
- Commit + push `fix-guest-event-link` → Vercel preview → PR → merge → deploy (fixes the live invite link).
- Run the $1 smoke test on `/e/no-bad-monday`.
- Fix branch: outer try/catch on guest `/e/` Stripe create + diagnose the two `/m/` 500s. **Plan-first, no merge/deploy without Adam.**

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
