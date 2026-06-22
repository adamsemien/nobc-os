# Platform Gap Audit — NoBC OS

**Date:** 2026-06-16
**Author:** Apex (engineering lead) synthesizing 6 parallel read-only tonone specialist crawls
**Method:** 6 tonone agents (spine ×2, prism, warden, proof, lens), one stream per domain, crawling the canonical `main` checkout. Read-only; no edits, no DB. **Code is ground truth** — where a spec doc (`CLAUDE.md`, `_context/*`) and the code conflict, the code wins and the conflict is called out.
**Frame:** judged as a real multi-tenant platform (Tenant Zero for a future premium-club SaaS), not a single-operator hobby app.

> Scope note: ticketing/payments were just hardened and were intentionally not re-litigated. This audit does **not** propose architecture rewrites, and does **not** recommend re-wiring the working hardcoded transactional email into DB templates (that is intentional). It flags; it does not fix.

---

## Executive scorecard

| # | Domain | Rating | One-line |
|---|---|---|---|
| 1 | Member lifecycle | **4/5** | Funnel is real and atomic, but the terminal step (approved → can sign in) is fragile, and your "no one-by-one review" belief is actually wrong (it exists, it's just hidden). |
| 2 | Event lifecycle | **4/5** | Create → publish → access → check-in are solid; the **post-event loop (recap/no-show/cancel email) is the weak end**, and check-in fails silently if `CHECKIN_SECRET` is unset. |
| 3 | Operator tooling | **3/5** | Real RBAC, real cross-entity search, real bulk actions — but dev/QA surfaces lack a `NODE_ENV` guard and some sensitive reads have no role floor. |
| 4 | Sponsor surface | **3/5** | The engine (firewall, surveys, recap math, share links) is genuinely built — but there is **no way to create a sponsor without a hand-seeded DB row**, so the whole surface dead-ends. |
| 5 | Data integrity & safety | **4/5** | RSVP + Stripe paths are transactional and idempotent. The **comp route bypasses the capacity gate** (can oversell a capped event). |
| 6 | Multi-tenancy readiness | **3/5** | `workspaceId` scoping is mostly disciplined; several Tenant-Zero singletons (`HOUSE_PHONE_WORKSPACE_ID`, `@nobc.demo`, possible cross-workspace red-list) would break at tenant 2. |
| 7 | Consistency | **2/5** | Three divergent visual systems (operator tokens / member editorial / apply inline-styles). Lowest score; the apply form is the worst offender **and is locked**. |
| 8 | Testing & observability | **3/5** | Money paths are well unit-tested and `alerting.ts` is wired to 10 callers — but `payment_intent.payment_failed` is **silent and untested**, and the capture cron swallows failures. |

**Cross-cutting read:** the platform is strong in the middle (event + access + payment + check-in) and thin at the **edges of the funnel** — the moment an applicant becomes a usable member (Clerk handoff), and the moment an event ends (recap / no-show / sponsor delivery). Those two edges, plus the comp-capacity hole, are where the highest leverage sits.

---

## Domain 1 — Member lifecycle — 4/5

**What exists (file evidence)**
- Public apply form: `app/apply/page.tsx` (standalone, no layout shell) + `app/apply/_components/MembershipForm.tsx` (1,862-line self-contained SPA, steps 0–8, draft-persist via `PATCH /api/apply/membership/[id]`, submit via `app/api/apply/membership/[id]/submit/route.ts`).
- Submit pipeline: duplicate check, Red List / BLOCKED block, PURPLE auto-approve, then **synchronous** AI scoring + tagging + personalized archetype copy (`submit/route.ts:110-168`, `claude-sonnet-4-20250514`).
- Canonical identity: `lib/member-identity.ts:73` `resolveMember()` find-or-creates at `(workspaceId, email)`, always GUEST, always mints `memberQrCode` via `lib/member-qr.ts:17`. Every creation path (approval, Clerk sign-in `lib/clerk-member.ts:42`, PURPLE auto-approve, operator manual create) routes through it.
- Approval: `lib/applications/approve.ts` is idempotent (409 on re-approve), atomic (`$transaction` updates Application + Member), fires `application.approved`/`member.created` audit+Svix, sends `welcomeEmail` (RESEND-guarded), attempts wallet pass if configured.
- **Operator review queue EXISTS:** `app/operator/applications/_components/ApplicationsQueue.tsx` is a split-panel (list + inline detail) with **`j`/`k` prev/next applicant, `a` approve, `h` hold, `r` reject, `/` search** (lines ~450-454, hint at line 686). Tab filters + count badges + bulk approve/hold/reject (`POST /api/operator/applications/bulk/route.ts`). Individual action routes are all `requireRole(STAFF)`.

**What's missing / half-built**
- **Approved member may have no Clerk account.** `approve.ts` sets `clerkUserId = 'applicant:{applicationId}'` (synthetic). No `clerkClient().users.createUser()` or `.invitations.createInvitation()` in the approve path (grep: "no clerk invite found"). The welcome email CTA points at `/m`, but the member can only get in if Clerk **self-service signup is enabled and matches their email**. **Unverified whether self-signup is on** — if it isn't, this is a funnel-terminating gap. `CLAUDE.md` does not document the intended handoff.
- **Your "no one-by-one review" belief is incorrect, but the feature is undiscoverable.** The `j`/`k` queue is real; the hint text renders *only inside the right detail panel*, invisible until an application is selected. And the permalink page `app/operator/applications/[id]/page.tsx` has breadcrumb-only nav — **no prev/next** — so landing on a permalink (e.g. from the Intelligence funnel) drops you out of the review flow.
- **Waitlist email never sent.** `app/api/operator/applications/[id]/waitlist/route.ts` moves status to HOLD with no email; `emails/WaitlistEmail.tsx` exists but nothing calls it from this route.
- **Applications list has no pagination.** `GET /api/operator/applications/route.ts:44` `findMany` with `include: { answers: true }`, no `take`/`skip` — pulls the full answers join for every row per tab.
- **AI scoring is synchronous on submit** (`submit/route.ts:111-168`) — the applicant's archetype reveal is tied to an Anthropic round-trip; on timeout the reveal falls back to an empty state.
- **`emails/DeclineEmail.tsx` is orphaned** — the reject route calls `applicationRejectedEmail()` from `lib/email-templates`, not the `emails/` component. Two decline templates; drift risk.

**Single highest-leverage fix:** Provision a Clerk account/invitation inside `lib/applications/approve.ts` (after first verifying whether self-service signup is currently relied upon), so approved members can actually enter the portal.

---

## Domain 2 — Event lifecycle — 4/5

**What exists**
- Create: `app/operator/events/new/*`, AI builder `app/api/agent/event-builder/route.ts`, MCP `lib/mcp/tools/events.ts:119`, `EventStatus.DRAFT` default (`schema:470`), series + flow templates.
- Publish: `PATCH /api/operator/events/[id]/route.ts:141` handles DRAFT→PUBLISHED; on first publish fans out `event.published` templated email to APPROVED members (`:218-256`, gated by `event.notify_on_publish`), fires `notifyProducer` + Svix.
- Access/ticketing (noted, not deep-dived): `OPEN|TICKETED` + `approvalRequired` + capacity/waitlist/plus-ones/comp all present; Stripe authorize/capture idempotent. Healthy.
- Check-in: signed event-scoped HMAC tokens (`lib/check-in-token.ts`, `timingSafeEqual` + expiry), minted server-side for STAFF+ at `app/check-in/[slug]/page.tsx:36`; three routes (`/api/check-in/[rsvpId]` idempotent+scope-checked+atomic, `/event` guest list, `/walkin`); PWA caches token in IndexedDB + registers `public/sw.js`.
- Day-of reminder cron `app/api/cron/event-reminders/route.ts` (idempotent via `reminderSentAt`).
- Recap engine is real (see Domain 4): `RecapSnapshot` model, `generateAndStoreRecap`, PDF→R2→magic-link.

**What's missing / half-built**
- **No `ENDED`/`CLOSED` event status** (`schema:420-424` = `DRAFT|PUBLISHED|CANCELLED`) and **no auto-transition when `endAt` passes** — events stay PUBLISHED forever; the recap UI has no "is this event over" guard.
- **No no-show / attendance report.** `checkedIn:false` data exists but there's no endpoint/page surfacing `{confirmed, checkedIn, noShow, walkIns}` per event.
- **Recap is sponsor-centric** — Recap Studio effectively needs a `sponsorBrandId`; **operators running non-sponsored events get no recap**.
- **Cancellation has no member email** — `PATCH→CANCELLED` fires Svix/Producer but **no `event.cancelled` fan-out** to confirmed RSVPs.
- **`CHECKIN_SECRET` unset = silent 401.** `mintCheckInToken` returns `null` (`check-in-token.ts:48`) → PWA loads but every scan 401s, with **no operator-facing preflight warning**.
- PWA offline is asset-only — the guest list is fetched live; a hard reload mid-event with no connectivity loses it (no IndexedDB guest-list cache).

**Single highest-leverage fix:** Add `GET /api/operator/events/[id]/attendance-summary` (`{confirmed, checkedIn, noShow, walkIns}`) and a tile on the event detail — closes the most visible post-event gap with no schema change.

---

## Domain 3 — Operator tooling — 3/5

**What exists**
- RBAC core `lib/operator-role.ts` is well-built: three-tier hierarchy, `getEffectiveRole` applies the Clerk-org floor, `requireRole`/`requireRolePage` enforce. **CLAUDE.md's RBAC claims are accurate for writes.**
- Real cross-entity search: `GET /api/operator/search/route.ts` fans out members + applications + events in parallel, workspace-scoped (not a filter stub).
- Bulk actions wired: `MembersBulkActions.tsx`, media `BulkActionBar.tsx`, `EventsTable.tsx`, `ApplicationsQueue.tsx` → backing `/api/operator/*/bulk/route.ts`.
- DevToolbar render-gated by `NEXT_PUBLIC_DEV_USER_IDS` allowlist (`DevToolbar.tsx:447`).

**What's missing / half-built**
- **DevToolbar has no `NODE_ENV` guard** — the only gate is a `NEXT_PUBLIC_` allowlist; one misconfigured prod env var → seed/persona/QA tooling renders in production for any listed user.
- **`app/qa-panel/page.tsx` is ungated** — no auth, no role check; QA scoring data reachable in prod by anyone who knows the route.
- **Sensitive reads have no role floor** (policy-open per CLAUDE.md "GET routes open to any resolved member", but questionable): `events/[id]/rsvps/route.ts` returns **Stripe payment-intent IDs + guest emails** to any org member; `intelligence/drilldown/route.ts` serves raw metric drill-downs; `search` is open. *Code-vs-spec note:* CLAUDE.md says "every `/api/operator/* write`" is gated — true; but it implies all reads are safe-to-any-member, which is debatable for these three.
- Applications page has **status-filter only, no text search** (the global search covers it, but the page itself doesn't).

**Single highest-leverage fix:** Add `NODE_ENV !== 'production'` as a hard short-circuit before the allowlist check in `DevToolbar.tsx:447`, and gate `qa-panel`.

---

## Domain 4 — Sponsor surface — 3/5

**What exists (more real than expected)**
- Real sponsor object: `SponsorBrandProfile` (`schema:1291`, with `declaredObjectives`, `targetPersonaCriteria`, `rightsFeeCents`, `icp`), `SeriesSponsor` join (`schema:1035`).
- **Structural PII firewall:** `lib/intelligence/sponsor-safe.ts` projects members to a sponsor-safe shape with a blocked-psychographic key union; tested (`tests/unit/sponsor-firewall.test.ts`).
- Sponsor Intelligence dashboard computes **live** NetworkCapital + Retention from the DB (no mocks); Haiku for narrative only (authorized exception).
- **Brand-lift survey end-to-end:** dispatch (`/api/intelligence/survey/route.ts`, magic-link email) → public form (`app/survey/[token]`) → idempotent submit → `computeBrandLift` (real top-2-box PRE/POST math, PII scrub).
- Activation booth (`createBoothLink` → QR → `GeneratedAsset`, public `app/activation/[token]`), recap delivery (PDF→R2→256-bit magic-link `/doc/[token]`), sponsor asset shares (`app/assets/[token]`, password gate, download cap, watermark).

**What's missing / half-built**
- **No operator CRUD for `SponsorBrandProfile`.** Zero `/api/operator/sponsors/*` routes; audience-brief dead-ends with `error: 'Create a sponsor brand first.'` (`audience-brief/route.ts:28`). **Creating a sponsor requires a direct DB insert — this blocks every downstream intelligence/recap action.**
- **Recap delivery has no email send** — `lib/intelligence/recap-delivery.ts` returns the URL; the operator must copy/paste the magic-link.
- Nightly insight generator **scaffolded but unwired** (`lib/intelligence/BACKLOG.md:23`).
- No sponsor portal / auth view / billing model (rightsFee is an optional field, no invoice model). By design for now; flagged for SaaS.
- `SponsorBrandProfile` fields are nullable with no completeness validation — a recap with `rightsFeeCents: null` silently degrades (EMV baseline shows "—").

**Single highest-leverage fix:** Build `/api/operator/sponsors` CRUD + an "Add Sponsor" slide-over — without it the entire (well-built) sponsor engine is unreachable in production.

---

## Domain 5 — Data integrity & safety — 4/5

**What exists**
- RSVP creation hardened: `lib/rsvp-submit.ts:135-179` `$transaction` + `SELECT … FOR UPDATE` on the Event row; capacity count includes `ticketStatus in ['confirmed','held']`; waitlist position computed in-tx; plus-ones are columns on the RSVP (no extra capacity unit). Same pattern in `lib/apply-event-rsvp.ts:58-79` with a pre-tx idempotency guard.
- Stripe webhook idempotent: two-layer dedup (`stripeEvent.findUnique` pre-check + `stripeEvent.create` inside the same `$transaction`), P2002 race catch (`stripe/route.ts:479-482`), money-state writes synchronous, side-effects via `after()`, 500-on-error so Stripe retries.
- DB backstop: `RSVP @@unique([workspaceId, eventId, memberId])` (`schema:650`).

**What's missing / half-built**
- **Comp route bypasses the capacity gate (verified).** `app/api/operator/events/[id]/comp/route.ts:53-77` — `findFirst` duplicate check then `db.rSVP.create` **directly, outside any transaction, with no capacity count and no `FOR UPDATE`**. An operator can comp past a capped event's limit, and two concurrent comps for different emails both clear the check (TOCTOU). This is the single integrity hole on the access-grant path.
- Stripe pre-check (`stripe/route.ts:88-94`) runs outside the transaction — the **P2002 catch is the real guard**; the pre-check is a cheap short-circuit. Not a bug, but the comment risks a future editor removing the catch. (Comment-clarity only.)

**Single highest-leverage fix:** Wrap the comp route's `findFirst`+`create` in a `$transaction` with `FOR UPDATE` on the Event row and the same capacity check as `rsvp-submit.ts:136-144` — closes both the oversell and the TOCTOU in one change.

---

## Domain 6 — Multi-tenancy readiness — 3/5

**What exists**
- `workspaceId` on every user-data table, indexed; primary write paths scope by workspace from **auth context, not client input**. `getMemberWorkspaceId` resolves via Clerk org. `requireRole` extracts `workspaceId` from the gate, not URL params.
- `APPLY_DEFAULT_WORKSPACE_ID` fallback is deterministic and loud: `app/api/apply/membership/route.ts:26-38` prefers the env var, falls back to oldest workspace, logs if >1 workspace exists unset.

**What's missing / half-built (Tenant-Zero assumptions)**
- **`HOUSE_PHONE_WORKSPACE_ID` is a deployment-wide singleton** scoping all inbound SMS to one workspace. No per-workspace Twilio-number registry in the schema — **breaks at tenant 2** (each tenant needs its own number→workspace mapping).
- **`@nobc.demo` hardcoded** in `app/api/intelligence/survey/route.ts:66` (`email.endsWith('@nobc.demo')`) — a Tenant-Zero demo assumption baked into product logic.
- **Possible cross-workspace red-list / member lookup** in `app/api/apply/[slug]/route.ts:66,69` — `member.findFirst` / `redList.findFirst` may be email-only (slug-based route runs before workspace resolves); if so, a red-listed email in workspace A could affect workspace B. **Needs verification.**
- **`getMemberWorkspaceId` multi-org resolution unverified** — the warden agent could only see the signature (`lib/auth.ts:64`), not the body. If it returns the *first* workspace for a multi-org user, SMS/data isolation could leak across tenants. **Needs a read-only body audit before tenant 2.**
- `APPLY_DEFAULT_WORKSPACE_ID` is documented but **not set in Vercel** (env, not code).

> *Honesty flag:* the red-list and `getMemberWorkspaceId` items are **suspected, not confirmed** — the agent flagged them as unverified. Treat as "audit next," not "known leak."

**Single highest-leverage fix:** Before onboarding tenant 2, do the small multi-tenancy audit pass: verify `getMemberWorkspaceId` isolation, confirm the `/apply/[slug]` red-list query is workspace-scoped, replace the `HOUSE_PHONE_WORKSPACE_ID` singleton with a per-workspace number map, and remove the `@nobc.demo` hardcode.

---

## Domain 7 — Consistency — 2/5 (lowest)

**What exists / the problem**
Three visual systems have grown independently, with **no bridging semantic layer**:
1. **Operator** (`app/operator/*`): `--bg`, `--text-primary`, `--primary`, `--border`, `--card` tokens + Tailwind utilities, full-width.
2. **Member editorial** (`app/m/*`): the `events-ref-*` cream family (`events-ref-cream-warm`, `events-ref-ink`, `events-ref-accent`), PP Editorial New.
3. **Apply** (`app/apply/*`): the most deviant — a JS `THEME` object with **all styling via inline `style={}`**, its own day/night `localStorage` toggle, and its own `<nav>`.

**Concrete inconsistencies (file evidence)**
- **Apply form off the token-utility system (your flagged instance, confirmed):** `MembershipForm.tsx` uses **zero Tailwind classes**; predominantly inline `var(--*)` tokens, but with **hardcoded hex literals** at `MembershipForm.tsx:886, 973` (`'#ffffff'`) and `app/apply/page.tsx:17` (`'#f9f7f2'`), and **raw font-family strings** at `MembershipForm.tsx:11-12` (a second source of truth for the brand fonts). This violates the CLAUDE.md "no hex literals / semantic tokens only" rule — *code is ground truth: the rule is not honored here.*
- **Settings pages use 5 different max-widths** with no scale: `max-w-4xl` (lists/theme/webhooks), `720px` (tiers), `820px` (model/application), `1000px` (communications), `1100px` (settings root). (CLAUDE.md says settings keep narrow caps "by design" — but the caps disagree with each other.)
- **No `app/m/layout.tsx`** — member sub-surfaces mount chrome per-page. *Correction to one sub-agent claim:* a `MemberShell` (Nav/Footer) component **does** exist in `app/m/.../_components/MemberShell` and is used by some pages (e.g. the confirmed page) — so it's an *inconsistent-adoption* problem, not a *missing-component* one.
- **Two token families never bridge** (`events-ref-*` vs operator `--bg/--primary`) — white-labeling a second tenant means customizing both separately.
- Stray inline styles outside apply: `intelligence/recap/page.tsx:60` uses inline `var(--text-secondary)` instead of the Tailwind token; `qa-panel/page.tsx` has multiple hex literals + an out-of-system `monospace` font.

> **Reconciliation:** the two agents that looked at apply differed slightly — one emphasized "inline `var(--*)` tokens throughout," the other cited specific hex literals. Both are right: it's **mostly inline tokens with a few hardcoded hex/font literals**, i.e. off the Tailwind-utility system, not fully hardcoded.

**Single highest-leverage fix:** Standardize the operator settings max-width scale and adopt a single member layout shell — the **safe, autonomous** consistency wins. *Do NOT* autonomously refactor the apply form: `MembershipForm.tsx` is **locked** (legal waiver copy on screen 7; CLAUDE.md requires explicit authorization), so its (large) migration is needs-human.

---

## Domain 8 — Testing & observability — 3/5

**What exists**
- 54 unit files; money/access paths covered at function level: `stripe-webhook.test.ts` (idempotency, capture guard, refunds, P2002), `stripe-refund-route.test.ts` (8 cases), `create-payment-intent-route.test.ts`, `guest-checkout-capacity.test.ts` (oversell race), `rsvp-capacity.test.ts` (12 cases), `waitlist-promote.test.ts` (10 cases), `check-in-token.test.ts`, `event-access*.test.ts`, `mcp-role-gate.test.ts`, `member-no-approve-bypass.test.ts`.
- **`lib/alerting.ts` is real and wired to 10 production callers** (Stripe dispute/refund/PI/capture/checkout, member access routes, event-builder, SMS reply, Producer webhook). Both error boundaries log-then-alert.
- `lib/email.ts` writes `email.skipped`/`email.sent`/`email.failed` auditEvents on every path (positive).
- 5 Playwright E2E specs (access modes, capacity/waitlist, guest checkout, spotlight).

**What's missing / half-built (silent failures)**
- **`payment_intent.payment_failed` / `canceled` is silent AND untested** — `stripe/route.ts` records the dedup row but fires no `alert()`; `stripe-webhook.test.ts` has zero coverage of this branch. Money didn't move, but the operator gets no signal.
- **`cron/capture-payments` swallows per-RSVP failures** into a results array, no `alert()`, no `console.error` — a batch of capture failures surfaces only if someone reads the cron response body.
- `promote-waitlist/route.ts` — no `auditEvent` on success, no route-level test (the lib function is tested, the route is not).
- `check-in/[rsvpId]` route-level scope check (token workspace/event must match the RSVP) is untested (the token crypto is tested).
- `check-in/walkin` has a `.catch(()=>{})` on the welcome email **with no prior log** (unlike the error-boundary swallow, which logs first).
- E2E has no CI fixture/seed automation (`playwright.config.ts`) — likely skipped in CI.

**Single highest-leverage fix:** Add an `alert()` (+ test) to the `payment_intent.payment_failed`/`canceled` branch in `stripe/route.ts` — the only money-path event that is both completely silent and completely untested.

---

## Cross-domain prioritized gap table

Sorted by severity, then leverage. **Autonomous-CC-safe** = a Claude Code agent can build it from existing patterns without a human design/credential decision.

| # | Gap | Domain | Severity | Effort | Autonomous-safe? |
|---|---|---|---|---|---|
| 1 | Comp route bypasses capacity gate + TOCTOU — operator can oversell a capped event | 5 Integrity | **blocks-event** | S | ✅ yes |
| 2 | Approved member may have no Clerk account → welcome-email CTA hits a sign-in wall | 1 Member | **blocks-event** | M | ⚠️ needs-human (verify self-signup; invite vs create decision) |
| 3 | `payment_intent.payment_failed` — no alert, no test (silent money-path) | 8 Test/Obs | **blocks-event** | S | ✅ yes |
| 4 | `cron/capture-payments` — silent per-RSVP capture failures | 8 Test/Obs | **blocks-event** | S | ✅ yes |
| 5 | No operator UI/API to create a `SponsorBrandProfile` — blocks all sponsor intelligence/recap | 4 Sponsor | **blocks-event** (sponsor revenue) | S | ✅ yes |
| 6 | Recap delivery has no email send — magic-link returned to operator only | 4 Sponsor | **blocks-event** (sponsor) | S | ✅ yes |
| 7 | Waitlist email (`WaitlistEmail.tsx`) never sent to held applicants | 1 Member | **blocks-event** | S | ✅ yes |
| 8 | Event cancellation sends no email to confirmed RSVPs | 2 Event | **blocks-event** | S | ✅ yes |
| 9 | `CHECKIN_SECRET` unset = silent 401 at the door, no operator preflight warning | 2 Event | **blocks-event** | S | ✅ yes |
| 10 | DevToolbar has no `NODE_ENV` guard (allowlist-only); `qa-panel` ungated | 3 Operator | pre-scale | S | ✅ yes |
| 11 | `events/[id]/rsvps` returns Stripe PI IDs + guest emails to any org member | 3 Operator | pre-scale | S | ✅ yes |
| 12 | `HOUSE_PHONE_WORKSPACE_ID` singleton — SMS scoping breaks at tenant 2 | 6 Tenancy | pre-scale (blocks T2) | M | ⚠️ needs-human (Twilio schema + Railway) |
| 13 | `getMemberWorkspaceId` multi-org isolation unverified | 6 Tenancy | pre-scale | S | ✅ yes (read-only audit) |
| 14 | `/apply/[slug]` red-list/member lookup possibly email-only (cross-workspace) | 6 Tenancy | pre-scale | S | ✅ yes |
| 15 | `@nobc.demo` hardcoded survey exclusion | 6 Tenancy | pre-scale | S | ✅ yes |
| 16 | No `ENDED` event status / no auto-transition after `endAt` | 2 Event | pre-scale | S | ✅ yes |
| 17 | No no-show / attendance summary report | 2 Event | pre-scale | S | ✅ yes |
| 18 | Recap requires a sponsor — no operator-only post-event summary | 2/4 | pre-scale | M | ✅ yes |
| 19 | Review-queue `j/k` shortcuts undiscoverable; `[id]` permalink has no prev/next | 1 Member | pre-scale | S/M | ✅ yes |
| 20 | Applications list has no pagination (full `answers` join per row) | 1 Member | pre-scale | S | ✅ yes |
| 21 | Settings pages: 5 inconsistent max-widths; no member layout shell adoption | 7 Consistency | pre-scale | S/M | ✅ yes |
| 22 | `promote-waitlist` route — no audit event, no route test | 8 Test/Obs | pre-scale | S | ✅ yes |
| 23 | Nightly insight generator scaffolded but unwired | 4 Sponsor | pre-scale | S | ✅ yes |
| 24 | Apply form off the token system + hardcoded hex/font literals | 7/1 | pre-scale | L | ⚠️ needs-human (`/apply` is LOCKED) |
| 25 | AI scoring synchronous on apply submit (latency/resilience) | 1 Member | pre-scale | M | ✅ yes |
| 26 | `DeclineEmail.tsx` orphaned from reject route (template drift) | 1 Member | nice-to-have | S | ✅ yes |
| 27 | walk-in welcome email `.catch(()=>{})` swallowed with no log | 8 Test/Obs | nice-to-have | S | ✅ yes |
| 28 | E2E suite has no CI seed automation | 8 Test/Obs | nice-to-have | M | ⚠️ needs-human |
| 29 | Alerting is email-only (no Slack/PagerDuty; no dead-man if Resend down) | 8 Test/Obs | nice-to-have | M | ⚠️ needs-human |
| 30 | PWA caches assets but not the guest list (no full offline scanning) | 2 Event | pre-scale | M | ⚠️ needs-human |

---

## The 3 highest-leverage things to build next (ranked)

### 1. Verify + fix the approval → member sign-in handoff  *(Domain 1, gap #2)*
**Why it's #1:** it's the terminal step of the entire member funnel. Apply, AI scoring, review, approval, welcome email — all of it is wasted if an approved member can't actually sign into `/m`. The code sets a synthetic `clerkUserId` and never creates a Clerk account or invitation, so entry depends on Clerk self-service signup being enabled and email-matched — **which is unverified.** Start with a 10-minute verification (is Clerk public signup on for this instance?). If yes: document it as the intended path and lower the severity. If no: add a Clerk invitation in `lib/applications/approve.ts` — a blocks-event fix. Either way you remove the single biggest unknown in the platform. *(Needs a human decision on invite-vs-signup, hence not a blind autonomous build.)*

### 2. Close the live money/door integrity + observability holes  *(Domains 5 + 8, gaps #1, #3, #4)*
**Why it's #2:** you run real, capped, paid events, and three verified holes sit directly on that path: (a) the **comp route can oversell a capped event** (no transaction/capacity check), (b) a **failed payment is completely silent**, and (c) the **capture cron swallows failures**. All three are **S-effort, autonomous-CC-safe**, and each mirrors an existing hardened pattern (`rsvp-submit.ts`'s `FOR UPDATE` + capacity count; `alerting.ts`'s 10 existing callers). This is the cheapest way to make the just-hardened money path trustworthy *and observable* before the next event — and it's safe to hand to an autonomous build.

### 3. Make the sponsor surface reachable: `SponsorBrandProfile` CRUD + recap delivery email  *(Domain 4, gaps #5, #6)*
**Why it's #3:** the sponsor engine — PII firewall, live intelligence, brand-lift surveys, recap PDFs, share links — is **genuinely built and mostly unreachable**, because there's no way to create a sponsor without a hand-seeded DB row, and recaps are never emailed. This is the highest *business* leverage for the least code: a small `/api/operator/sponsors` CRUD + "Add Sponsor" slide-over + one `sendTemplatedEmail` call turns a dormant, well-architected revenue surface into a usable product — and it's the most concrete piece of the multi-tenant SaaS pitch. **S-effort, autonomous-safe.**

> **Honorable mention (do in parallel, cheap & safe):** the waitlist + cancellation emails (gaps #7, #8) and the `CHECKIN_SECRET` preflight warning (#9) are all S-effort, autonomous-safe, blocks-event-class fixes that each remove a silent "nothing happened" experience for a real attendee.

---

## Appendix — method & honesty notes

- **Agents:** `tonone:spine` (member lifecycle), `tonone:spine` (event lifecycle), `tonone:prism` (operator tooling + consistency), `tonone:warden` (integrity + multi-tenancy), `tonone:proof` (testing + observability), `tonone:lens` (sponsor). All read-only, all instructed that code outranks spec docs.
- **Explicitly unverified (do not treat as confirmed):** `getMemberWorkspaceId` body isolation (`lib/auth.ts:64`), the `/apply/[slug]` red-list workspace scoping, SMS-route workspace scoping, and whether Clerk self-service signup is currently enabled. These are "audit next," not "known broken."
- **Code-vs-spec conflicts surfaced:** (a) the operator's belief that there is no one-by-one application review — there **is** (`ApplicationsQueue` `j/k`), it's just hidden; (b) CLAUDE.md "no hex literals" — violated in `app/apply` and `qa-panel`; (c) CLAUDE.md "every operator write is role-gated" — accurate for writes, but several sensitive *reads* have no role floor; (d) one sub-agent's "no MemberShell component" claim — incorrect, a Nav/Footer shell exists but isn't adopted at the `app/m` layout level.
- **Out of scope by instruction:** no architecture rewrites proposed; no recommendation to move hardcoded email into DB templates; payments not re-litigated beyond noting state.
