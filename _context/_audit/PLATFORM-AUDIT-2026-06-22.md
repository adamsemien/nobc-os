# NoBC OS — Full Platform Audit (2026-06-22)

**Method:** 7 parallel read-only specialist agents (security, app-sec, QA/correctness, visual design, accessibility, backend/architecture, reliability/observability). Findings below are consolidated, de-duplicated, and **calibrated** by a follow-up code read where severity was in question. Each item is tagged CONFIRMED (read in code) or SUSPECTED (pattern-matched, needs runtime confirmation).

> Legend: **[FINDING]** = something an agent found in the code. **[SUGGESTION]** = my recommendation, not a defect.

---

## Overall rating: **6.5 / 10**

A broad, genuinely well-architected platform (V1 complete + a large amount shipped beyond it) with premium polish — held back by **one live correctness regression on the flagship funnel**, **no production error observability**, **accessibility debt on the public apply form**, and a set of **scale-cliff** query patterns. None are catastrophic; nearly all are well-understood and cheaply fixable. Foundation is an 8; the open P0/P1 items are what pull it to 6.5 today.

### Domain scorecard
| Domain | Score | One-line |
|---|---|---|
| Security (authz/tenancy) | 7 | RBAC + workspace scoping solid; IDOR on public apply `[id]`, dev-seed-in-prod footgun |
| App-sec (code vulns) | 7 | Prisma parameterized, SSRF guard, magic-byte sniff; email HTML injection + non-constant-time secret compares |
| QA / correctness | 6 | Money paths solid; **scoring is void for new applicants** + apply silent-failure |
| Backend / architecture | 6 | Correct tenancy + tx discipline; unpaginated lists, 4 missing indexes, in-mem rate limit |
| Visual design | 6 | Token system well-built; check-in PWA off-token, "RSVP" copy violations |
| Accessibility | 5.5 | Operator foundation OK; `/apply` has multiple WCAG AA fails on a live legal surface |
| Reliability / ops | 5 | Money-path hygiene good; **no error tracking, no healthz**, cron auth footgun |

---

## What's solid (don't lose this)
- **Multi-tenant model is correct by default** — `workspaceId` scoping is the prevailing pattern; most queries respect it.
- **Money path is disciplined** — Stripe webhook signature verification, idempotency/dedup table, per-capture alerting, Producer Phase J HMAC uses timing-safe compare.
- **Input safety basics** — Prisma parameterization throughout (no raw SQL injection found, incl. the DAM `ANY()` tag search), zod on public inputs, file magic-byte sniffing, an SSRF allow/deny guard (`lib/safe-url.ts`).
- **Design-system architecture** — `globals.css` token system + 12 themes is well-built; the brand language is coherent where tokens are used.
- **A11y foundation** — global `:focus-visible` ring, Radix primitives, root skip-link.

---

## P0 — Fix now (live correctness / revenue)

1. **[FINDING · CRITICAL · CONFIRMED] AI scoring is effectively void for every new applicant since the rebuild shipped.**
   The new form (`app/apply/_lib/questions.ts`) writes **bare** answer keys (`obsessedWith`, `whatYouDo`, `loyalCommunity`, …). The scoring resolver (`lib/scoring.ts` → `lib/question-key-map.ts`) bridges canonical `stableKey`s to the *old* dotted vocabulary (`real.*`, `world.*`) and the DB `ApplicationTemplate` `QuestionDefinition.stableKey`s describe the *old* questions. Net: new-form answers resolve to `undefined`, the scoring prompt sees empty content, and applicants collapse toward the fail-safe (Connector / 50 / `unclear`, no tags). The operator review queue is filling with **no real signal**. This is the higher-severity confirmation of the "two follow-ups outside /apply" already flagged in `_context/01-apply/CONTEXT.md`.
   **Fix:** extend `lib/question-key-map.ts` to bridge the new bare IDs (code-only, fastest), **or** update the DB `ApplicationTemplate` QuestionDefinitions' `stableKey`s. Then backfill-rescore applications submitted since the deploy.

2. **[FINDING · HIGH · CONFIRMED] `patchAndAdvance` swallows the create-POST failure; applicant silently loses their submission.**
   `MembershipForm.tsx` (~579-606): the `try` wrapping `POST /api/apply/membership` ends in `catch { /* silent */ }`. On a flaky connection the POST fails, `applicationId` stays `null`, the user still advances, every later PATCH hits `/api/apply/membership/null`, and `handleSubmit`'s `if (!applicationId) return` makes the submit button do nothing — no error shown. Top-of-funnel membership loss.
   **Fix:** surface an error and do **not** `advance()` when no `applicationId` was created.

3. **[FINDING · HIGH · CONFIRMED] Reveal "YOUR STORY" duplicates "BY DAY" whenever `personalizedCopy` is empty.**
   `personalizedStory = submitResult?.personalizedCopy || dayStory` (`MembershipForm.tsx:758`). On any Anthropic timeout/empty result the YOUR STORY block renders `dayStory` under the "YOUR STORY" label — identical to BY DAY. (Already flagged 2026-06-22; this is the cheap half of the fix.)
   **Fix:** only render the YOUR STORY block when `personalizedCopy` is non-empty. (Distinct copy / a static `yourStory` field is Adam's call — no copy invented.)

---

## P1 — Before any traffic / marketing push

4. **[FINDING · CRITICAL · CONFIRMED] No production error observability.** Zero Sentry/Datadog/Bugsnag. The only alert channel (`lib/alerting.ts`) is fire-and-forget and **silently no-ops if `RESEND_API_KEY` is unset**. Every nighttime exception is invisible unless someone tails Vercel logs. **Fix:** add `@sentry/nextjs` + a `GET /api/healthz` (Neon ping) wired to an uptime monitor. `RESEND_API_KEY` should be in the required-env list.

5. **[FINDING · HIGH · CONFIRMED — flagged by 4 of 7 agents] In-memory rate limiting is ornamental at scale.** `lib/public-rate-limit.ts` (and the agent + client-error limiters) are module-scoped Maps; each warm Vercel instance has its own, so effective limit = configured × instances, and it resets on cold start. The most exposed route, `/api/apply/membership`, fans out to **two Sonnet calls** per submit. **Fix:** Upstash Redis / Vercel KV (`@upstash/ratelimit`, ~20 lines).

6. **[FINDING · MED · CONFIRMED] Public endpoints missing rate limits:** `/api/e/[slug]/access/submit` (new public RSVP path — its sibling `payment-intent` *is* limited) and the apply **PATCH** handler. Enables RSVP/PII spam + fake-guest mass creation. **Fix:** add `publicRateLimit(req)` (already exists).

7. **[FINDING · HIGH · CONFIRMED by follow-up read] IDOR on the public apply draft.** `GET`/`PATCH` `/api/apply/membership/[id]` have **no auth and no workspace anchor** — only an `id` regex + `status==='PENDING'`. A leaked `?id=` URL lets anyone read the applicant's PII (name/email/phone/all answers) or overwrite their contact fields. (Mitigated by CUID-unguessability; the risk is URL leakage + no session binding.) **Fix:** bind the draft to a first-party session cookie or a signed token; don't act on a bare `id` alone.

8. **[FINDING · CRITICAL-if-unset · CONFIRMED by follow-up read] `capture-payments` cron auth footgun.** `app/api/cron/capture-payments/route.ts:10` compares `authHeader !== \`Bearer ${CRON_SECRET}\`` with **no `!CRON_SECRET` null-guard** (the other crons have it). If `CRON_SECRET` is ever unset, sending `Authorization: Bearer undefined` bypasses auth on the **money-capture** cron. Also its outer `db.rSVP.findMany` isn't try/caught — one Neon hiccup silently skips all captures that night (holds expire at 7 days). **Fix:** add the null-guard + wrap the query in try/catch with `alert()`. Confirm `CRON_SECRET` is set in prod.

---

## P2 — Hardening / scale prep

9. **[FINDING · HIGH · CONFIRMED] 4 missing composite indexes + the unused partial-unique dedup index.** Add `@@index` on `Application(workspaceId,status)`, `RSVP(eventId,ticketStatus)`, `MemberEngagementEvent(workspaceId,memberId)`, `Asset(workspaceId,deletedAt)`; apply the already-written `prisma/sql/apply-dedup-partial-unique.sql`. Additive SQL via `prisma db execute` (never `db push`).
10. **[FINDING · CRITICAL-at-scale · CONFIRMED] `GET /api/operator/events` loads O(events × rsvps) rows** to compute capacity/revenue in memory. Replace the `rsvps` include with `groupBy` aggregates. Same file returns DRAFT events to all callers (info leak to READ_ONLY).
11. **[FINDING · HIGH · CONFIRMED] No pagination on ~22 operator list endpoints** (events, applications, members, …). Add cursor pagination + `take` caps.
12. **[FINDING · MED · CONFIRMED] Non-constant-time secret comparison** on cron routes + DAM tag route (`!==` on bearer secrets). Wrap in `timingSafeEqual` via a shared helper.
13. **[FINDING · MED · CONFIRMED] Email HTML injection / stored XSS.** `lib/email.ts` `interpolate()` substitutes user-supplied values (applicant names) raw into `bodyHtml`; the operator Communications **preview** renders `bodyHtml` via `dangerouslySetInnerHTML` with no sanitization (ADMIN-only, but live XSS surface). HTML-encode variables for the `html` path; DOMPurify the preview.
14. **[FINDING · MED · CONFIRMED] Other reliability/data gaps:** `lib/stripe.ts` non-null-asserts `STRIPE_SECRET_KEY!` → opaque cold-start crash if unset; `RSVP` carries dual `status` + `ticketStatus` that can drift; TOCTOU between Stripe `capture()` and the DB write; N+1 in `event-reminders` + `applications/bulk`; DAM GIN/HNSW indexes live out-of-band (CI guard recommended); `lib/db.ts` has no Neon pool config.

---

## P3 — Accessibility + design polish

15. **[FINDING · CRITICAL (a11y) · CONFIRMED] `/apply` WCAG AA failures on a live, legally-exposed form:**
    - `getInputStyle` sets `outline:'none'` on every field → no keyboard focus indicator (1.4.3 / 2.4.7).
    - Inputs/textareas have no `id`; labels aren't `htmlFor`-associated → screen readers don't announce any of the 39 questions (4.1.2).
    - Validation errors are plain `<p>` with no `role="alert"`/`aria-live` (4.1.3).
    - Section interstitial is a full-screen overlay with no `role="dialog"`, no focus management, no keyboard dismiss → keyboard trap (2.1.2).
    - Day/night toggle is emoji-only, no `aria-label`/`aria-pressed`; no focus move on step change; root skip-link target `#main-content` doesn't exist in the apply layout.
    **Fix:** these are mostly small, mechanical adds; highest-leverage is `id`/`htmlFor` + removing `outline:none` + the interstitial dialog semantics (Radix `Dialog` is already in-stack).
16. **[FINDING · MED (a11y) · CONFIRMED] `--text-tertiary` fails contrast:** `#A8978A` on `#F9F6F1` = 2.61:1 (day), `#5C4A7A` on `#0D0A14` = 2.54:1 (night) — below 4.5:1, and used for help text on `/apply`. Bump the token.
17. **[FINDING · HIGH (brand law) · CONFIRMED] "RSVP" leaks into member-facing copy** (member portal home/`rsvps` page/nav/help, + operator AccessModeSelector label) — violates the canonical terminology law. Copy-only edits to "Access"/"Events".
18. **[FINDING · HIGH (white-label) · CONFIRMED] Check-in PWA + WalkinModal are off-token** (~20 hex literals incl. `#B22E21`, `#0a0a0a`) → break theming/white-label. Tokenize. Plus ~13 `SERIF/SANS` font-string constants across pages (incl. the new ticket page) that should be `var(--font-display/body)`.

---

## [SUGGESTION]s (mine — not defects)
- **Add a scoring integration test as a CI gate.** A single test — Application with new bare-ID answers + a matching template, assert `memberWorthTotal > 0` and `archetype !== 'Connector'` — would have caught P0#1 before deploy. This is the biggest test-coverage gap.
- **CI health check for the out-of-band DB indexes** (`SELECT indexname … 'Asset_searchVector_idx'`) so a stray `migrate reset` can't silently kill DAM search.
- **Consolidate the three answer-key vocabularies** (live bare IDs / `apply-config` camelCase / `question-key-map` dotted) into one — this drift is the root cause of P0#1 and will keep biting.
- **Segment-level `error.tsx`** under `app/operator/` and the member tree so mid-flow errors degrade gracefully instead of resetting to the global boundary.
- **DNS-rebinding hardening** on the outbound Slack-webhook fetch (resolve + reject private IPs).

---

## Confidence notes
- **Highest confidence (cross-corroborated):** in-memory rate limiter (4 agents), non-constant-time/cron secret handling (2), the answer-key/scoring gap (QA agent + existing docs + my read). 
- **Verified by follow-up code read:** apply `[id]` IDOR, the `capture-payments` CRON_SECRET null-guard gap.
- **SUSPECTED (need runtime/config confirmation):** the PURPLE auto-approve ordering (welcome email before scoring persist), intelligence-pipeline N+1, whether `CRON_SECRET`/`RESEND_API_KEY` are actually set in prod (would down/up-grade #4 and #8).
