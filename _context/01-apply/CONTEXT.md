# Stage 01 — Apply

> Membership application form, AI archetype scoring, and reveal screen.

## Status

| Field | Value |
|---|---|
| **State** | ✅ **LIVE in production + merged to `main` (2026-06-22)** — the full rebuild (editorial redesign + 6 chapter-pages + progress bar + localStorage resume + speech-to-text + mobile/rhythm polish + copy cleanup) was deployed to prod via `vercel --prod` from `feat/apply-rebuild-redesign` (aliased to thenobadcompany.com / app. / www. / nobc-os.vercel.app). The branch was then merged to `main` (origin/main = branch tip `8f6ff13`), so git matches production. Final copy pass: removed the "attorney review" disclaimer line from the legal screen, and swept all em dashes out of rendered copy (waiver header, tab title, and `config/archetypes.ts` narrative strings — copy-only, Adam-authorized). (+ application-backup feature code-complete, dormant on a branch) **(+ Phase C front-door — branch `feat/apply-front-door`, committed/unmerged: state-aware `/apply` routing for the 5 signed-in states (door / resume draft / "application received" / approved→`/m` / decided→graceful) + a `UserButton` auth-chrome on the apply layout. Reads state only — no schema change, no NEW DB write. Deploys later WITH the Phase B consent dual-write branch, NOT yet in prod.)** **(+ Applicant photo upload — branch `feat/apply-photo-upload`, committed/unmerged 2026-07-02: new `photo` FieldType + a required 1-to-5 photo picker (previews + remove + type/size/count validation) closing the Section 01 identity page; files upload through the existing public R2 endpoint inside the untouched frozen `handleSubmit`, persist as the `photos.urls` answer, and render inline on the operator review screen as before; a post-PATCH best-effort mirror (`lib/apply-photo-mirror.ts`, runs via `after()`) additionally materializes each photo as a DAM Asset row in an auto-created "Applications" folder — `sourceSystem='apply'` / `sourceId=<R2 key>` provenance, ZERO schema change. Frozen zone (handleSubmit / patchAndAdvance / consent block / scoring) untouched.)** **(+ Dev-param fence — branch `feat/fence-apply-dev-params`, PR #124, committed/unmerged 2026-07-02: `?demo=true` skipped required-field validation for ANY production visitor; both `?dev=true` and `?demo=true` now activate only in local development or for a signed-in Clerk-org member (`useAuth().orgId`), silently inert for everyone else. One pure resolver in MembershipForm.tsx + a source-extract-and-evaluate unit test.)** **(+ P0 prod-submit fix — branch `fix/submit-queryraw-void`, PR #125, MERGED to `main` + DEPLOYED to production 2026-07-02: the once-only-guard advisory lock (fddf198) used `$queryRaw` on void-returning `pg_advisory_xact_lock()`, which Prisma 7 cannot deserialize — every prod submission returned 500. One line to `$executeRaw`; lock semantics verified identical; E2E submit + cached replay proven on a prod build against the dev DB. Root gap: submit has no real-DB test — the unit suite mocks `@/lib/db`.)** |
| **V1 item** | #1, #5 |
| **Last updated** | 2026-07-20 |
| **Chloe review tool (unmerged, on `feat/chloe-application-review`)** | 2026-07-14 — internal Clerk-gated dark-link tool at `/review/application` (no nav entry anywhere) for Chloe to review/edit the application quiz: faithful port of `nobc-application-review-v2.html` (Fraunces + Spline Sans Mono via next/font, Questions/Reveal/Natures tabs, colored status buttons, KEY panel, Export/Import; SEED + NATURES ported verbatim EXCEPT the `dim`/"Dims in" + `edge`/"At edge" nature fields, which are excluded everywhere — positive framing only, Chloe's hard rule). Questions tab autosaves (debounced ~800ms server-action upsert) to a new additive `ApplicationReviewState` model — single JSON row keyed `"main"`; intentionally NOT workspace-scoped (internal single-tenant ops tool, no member data, model shape specified by Adam). Only auth change: middleware `isProtectedRoute` gained `'/review(.*)'`. `tsc` + `next build` clean. **Adam gates:** run the additive CREATE TABLE SQL in the Neon console (the page errors on load until the table exists), deploy a preview, send Chloe the link. NOT committed. |
| **Phase 5 (Reveal B, unmerged, on `feat/apply-new-six`)** | 2026-07-07 — reveal reordered to PHRASE-FIRST (opens on the member's Q6 openerPhrase, then names + explains the nature); decisive blend now PERSISTED + read verbatim (fixes the ~55/45 flattening — reveal no longer recomputes from the normalized vector); habitat TEMPLATED from the member's literal Q4/Q5 picks; reveal note FOLDED into the single grader call (no 2nd AI call — grader receives the already-decided nature, never reclassifies); nature art wired via `mix-blend-mode: multiply` on `/public/archetypes/{enum}.png` (README added). Additive Application columns (revealSecondary / revealBlendPrimary / revealBlendSecondary / revealOpenerPhrase / revealHabitatThrive / revealHabitatDim) — reviewable SQL at `prisma/sql/apply-scoring-v2-reveal-2026-07.sql` (Adam runs it; agents never touch the DB). `tsc` + `next build` clean; unit suite green except the same pre-existing apply-create-route + apply-submit-route load failures. Frozen zones (tally engine, normalize, config/archetypes.ts, gate engine, consent, In-A-Room components) untouched. **Adam gates:** run the reveal SQL, drop the 6 art PNGs, decide the operator-% question (no bug found in code), and the nature-art contrast on the near-black reveal bg. NOT committed. |
| **Phase 6 (Reconcile, committed on `feat/apply-new-six`)** | 2026-07-08 — reconciled the `/apply` form + scoring to the canonical July-6 set (13 scored + 6 taps). Form: cut `recommendForPay`; reworded `comeToYouFor` + `walkIntoRoom` subtext (`CHAPTER_PAGE_IDS` + preview fixture kept in sync). Scoring: a guarded, delete-free reconcile SQL (`prisma/sql/apply-scoring-v2-reconcile-2026-07.sql`) that strikes the taste model + `investedIn`/`flowThrough`/`recommendForPay` and re-asserts all 13 to `scripts/seed-questions.mjs` values — every strike hard-guards the six taps (`roomPosition`/`giftMaking`/`partyJudge`/`perfectFriday`/`skipFriday`/`bestSelf`), zero DELETEs, additive + idempotent. **Adam RAN it in prod 2026-07-08: verified 13 scored + 6 taps intact, guard held.** `tsc` + `next build` clean; frozen-zone tests (key-map sync guard + reveal personas + decisive blend + JOB-3 fold) green; same pre-existing apply-create-route + apply-submit-route failures. Form NOT flipped live. |
| **Current build (unmerged)** | `feat/apply-new-six` (2026-07-06) — six-archetype recut (Builder / Connector / Caregiver=stored Host / Sage / Champion=stored Patron / Spark; Curator + Maker struck everywhere; `displayName` layer so stored enums never change in DB/API) + apply question rework (13 struck, 4 new scored — characteristicsGoodAtJob/walkIntoRoom/unplannedFun/meetPeople; `homeAddress` → street+city+state+zip group; referrals → first/last; enneagram→select + new MBTI/loveLanguage selects) + 15-row scoring re-seed (`scripts/seed-questions.mjs`; PROD SQL saved to `prisma/sql/apply-scoring-reseed-2026-07.sql`) + reveal rebuild (animal art `/public/archetypes/{enum}.png` + displayName + Who-you-are/The-cost/How-you-move beats + `personalNote` "why we called you this" + top-two blend line; **day/night + the YOUR STORY duplicate are REMOVED, so the personalizedStory/dayStory bug called out in the Blocked-on / Next rows below is now moot**) + tokened reviewer preview link (`/apply/preview?t=`, `lib/apply-preview-token.ts`, `applyprev` HMAC on `CHECKIN_SECRET`, 14-day). Additive schema only: `Application.personalNote` (`prisma/sql/apply-personalnote-column-2026-07.sql`, reviewed via `migrate diff` = ADD COLUMN only). Scoped unfreeze honored (scoring.ts enum/schema/prompt; MembershipForm render/reveal/preview/personality). `tsc` + `next build` clean; unit suite green except pre-existing unrelated failures (apply-create-route + the apply-submit-route load error, both reproduced on the clean base). **Adam gates:** run the two Neon SQL files, drop 6 art PNGs in `/public/archetypes/{connector,host,builder,patron,sage,spark}.png`, deploy via push to `main`. **NB: the pre-existing State-row merge-conflict (two duplicate rows) was RESOLVED 2026-07-08 during the Phase-6 commit — kept the `origin/main` State row; the dropped HEAD row's Photo-render P0 detail already lives in the Blocked-on / Next rows, so nothing was lost.** |
| **Owner** | Adam |
| **Blocked on** | **Chloe review tool (`feat/chloe-application-review`):** Adam runs the `ApplicationReviewState` CREATE TABLE SQL in the Neon console + deploys a preview — `/review/application` errors on load/save until the table exists. Otherwise: Nothing — photo-render P0 fix implemented + preview-verified on branch `fix/application-photo-upload-and-render`; Adam merges + deploys. Otherwise nothing — shipped to production and merged to `main`. Outstanding follow-ups: (a) the two items OUTSIDE `/apply` so AI scoring is tuned to the new questions (operator review labels in `lib/legacy-answer-labels.ts`; DB `ApplicationTemplate` QuestionDefinitions) — scoring currently runs fail-safe, not tuned; (b) **reveal "YOUR STORY" duplicate (flagged 2026-06-22, NOT fixed):** `personalizedStory = submitResult?.personalizedCopy \|\| dayStory` (`MembershipForm.tsx:758`) renders the AI `personalizedCopy` in the YOUR STORY slot with a `dayStory` fallback. There is **no `yourStory` field** in `config/archetypes.ts` (fields are name/oneLiner/dayStory/nightStory/tags/sponsorSegments/spectrumDescription). So when `personalizedCopy` is empty/blank, YOUR STORY echoes BY DAY verbatim. Per Adam's instruction no narrative copy was invented. Adam to decide: supply a static `yourStory` per archetype + wire `personalizedCopy \|\| yourStory`, OR hide the block when `personalizedCopy` is empty, OR investigate why `personalizedCopy` comes back empty (the personalization call in `app/api/apply/membership/[id]/submit` — is it populating reliably in prod?). **→ 2026-06-23: the YOUR STORY duplicate is now FIXED in code** (`MembershipForm.tsx` — `personalizedStory` no longer falls back to `dayStory`; the block renders only when AI `personalizedCopy` is non-empty). **NEW BLOCKER (P0-DATA, needs Adam):** the live DB has **0 `ApplicationTemplate` rows and 0 `QuestionDefinition` rows** and `workspace.defaultTemplateId` is NULL, so `scoreApplication` (`lib/scoring.ts`) finds no scored questions and scores every applicant on their **name alone** — scoring is structurally void, not merely untuned. The code half is fixed (`lib/question-key-map.ts` rewritten to bridge the seed's stableKeys → current form keys + a guard test), but scoring stays void until the template + questions are seeded to prod (`scripts/seed-questions.mjs`). Seeding defines how real applicants are judged → reserved for Adam's sign-off (ties to the "swap apply questions" task). **Phase C front-door (`feat/apply-front-door`): nothing blocking — Pass 1 (routing + chrome) committed; the whole branch deploys WITH the Phase B consent dual-write, not before.** |
| **Next** | **Submit-route atomic transaction boundary — Option B (2026-07-20, workspace branch `apply-tx-boundary-b`, UNCOMMITTED working tree, awaiting Adam's review):** the submit route reworked to score-first + ONE write transaction — scoreApplication (the Anthropic call) now runs BEFORE any route-level write and never while a write tx / advisory lock is held; duplicate + watchlist become pre-scoring READS (billing short-circuit preserved); every consistent write (duplicate/blocked audits, BLOCKED status+submittedAt, PURPLE APPROVED+reviewedAt+audit, aiScore/submittedAt stamp) commits on the tx client under the per-draft pg advisory xact lock — all or none; PURPLE member resolution stays outside the tx (idempotent, per ratified design); the PURPLE welcome email moved post-commit with Resend `idempotencyKey: purple-welcome/<appId>` (resend 6.12.3). ZERO schema change; scoring.ts / member-identity.ts / watchlist.ts untouched; both response shapes byte-identical; tx opts kept `{ timeout: 60_000, maxWait: 20_000 }` per Adam. Proven by `scripts/verify-submit-atomicity.ts` against Neon dev (28/28: induced in-tx abort → zero footprint + clean retry; email idempotency; no reviewedAt/approvedAt drift on resubmit; blocked+duplicate never score; shapes; concurrent single-winner). **Adam gates:** review the diff on the branch (NOT committed/merged per instruction). — PRIOR: **Apply scalar promotion (2026-07-16, workspace branch `apply-scalar-promotion`, UNCOMMITTED working tree):** answers now promote to typed `Application` columns — new shared mapper `lib/apply/promote-answers.ts` (`cell`→`phone` via `toE164`, promote-on-parse-only; `homeAddress.city`→`city`; `homeAddress.zip` returned for the Person carry, NO schema change). Write path: create + PATCH + reuse/P2002 branches promote on every save. Read path: submit promotes before checkDuplicate/checkWatchList/Door-1 resolveMember (activates previously-dead phone matching on the watchlist/dup gates — see session report); approve promotes + fill-if-empty enriches Member.phone and Person.{phone,postalCode}. Unit-pinned (`tests/unit/promote-answers.test.ts`); tsc/lint/vitest clean (4 pre-existing apply-create-route failures reproduced on clean base). **Adam gates:** review diff, commit/merge/deploy, then run the POST-DEPLOY backfill SQL (in the session report) for the 10 legacy applications + verification SQL. — PRIOR: **Chloe review tool (2026-07-14, branch `feat/chloe-application-review`):** Adam reviews the branch, runs the additive `ApplicationReviewState` SQL in the Neon console (in the session report's NEON block), deploys a preview, and sends Chloe the dark link `/review/application`. — PRIOR: **Photo-render P0 (2026-07-02, branch `fix/application-photo-upload-and-render`, commit `bb90419`):** Adam reviews, merges, deploys — the fix is preview-verified (real R2 write + read); after deploy, one real submission with a photo should render inline and land in the DAM "Applications" folder. The two orphaned Dirk photos are disposable per Adam (application already rejected) — no recovery. Env note for future preview QA: the Preview `DATABASE_URL` points at a stale schema fork (missing `clerkUserId` + consent columns) — repointing/refreshing it would let create/PATCH (and the mirror) run on previews. — PRIOR: **Applicant photo upload (2026-07-02, branch `feat/apply-photo-upload`):** Adam reviews the PR, merges, deploys via `vercel --prod --archive=tgz` — no schema migration needed. Local-dev note: the four `R2_*` values are empty in `.env.local` (Vercel sensitive vars never pull), so the upload endpoint 503s locally; the mirror is verified by `npx vitest run --config vitest.acceptance.config.ts` (real dev-DB rows, in-memory R2) and `scripts/acceptance-apply-photo-mirror.ts` is the full-loop variant to run where real R2 creds exist. — PRIOR: **Phase C front-door — Pass 1 DONE (2026-06-30), branch `feat/apply-front-door` (off `feat/apply-consent-fields` @ `1a64649`):** state-aware routing + auth chrome. `app/apply/page.tsx` now routes the signed-in caller by application state — (a) signed-out / (b) signed-in no-app → the account+consent gate; (c) PENDING draft (`aiScore===null`) → resume the form via `?id=`; (d) submitted (`aiScore!==null`) → presentational "Application received."; (e) APPROVED member → `redirect('/m')`; decided (REJECTED/WAITLISTED/HOLD) → graceful "thank you" (never the door). Member detection is a PURE READ on `Application{clerkUserId, status:'APPROVED'}` (legacy-anonymous-approved miss is an accepted gap, self-heals on `/m`). A new presentational `ApplicantStatusView` was extracted from `ApplicantStatus` so `/apply` renders the card from router-computed props WITHOUT triggering the self-contained member-claim fallback (`getMemberPortalContext`, which writes). `app/apply/layout.tsx` gained a fixed `UserButton` (sign-out + switch-account) for signed-in applicants. `tsc` + eslint clean; committed, NOT pushed/merged/deployed. **Pass 2+ accumulate on this same branch.** — PRIOR: **Apply rebuild + flow overhaul in review** (branch `feat/apply-rebuild-redesign`, not merged): theme-leak lock (`app/apply/layout.tsx`) + module-driven 3-section 39-question form (`app/apply/_lib/questions.ts` = single source of truth) + editorial redesign + cosmetic fixes (indicator placement, toast removed, label/answer contrast). **Flow overhaul (2026-06-22):** re-paginated 19 → 6 chapter-pages via an explicit `CHAPTER_PAGE_IDS` map in `MembershipForm.tsx` (12·3·6·5·8·5 = 39; same questions/order/copy, layout-only — note the explicit grouping puts referrals+enneagram on Page 1 and idealSaturday+workout on Page 5, a minor adjacency shift from the module's interleave); global progress bar anchored to the header nav (replaces the quiet 01/03 corner indicator, which is removed); `localStorage` draft-resume keyed `nobc-apply-draft` (persist on advance, restore-prompt on load, clear on submit via a `submitResult` watcher so `handleSubmit` stays byte-for-byte); speech-to-text mic button (Web Speech API, additive) on long-form textareas only, hidden where unsupported; native autofill/dictation glyphs suppressed via `.apply-form` webkit-pseudo CSS. Submission/scoring/consents/reveal byte-for-byte. **Mobile polish pass (2026-06-22):** legal title now PP Editorial italic (was sans); repeated big serif section title demoted to the eyebrow on non-first pages of a section (interstitial owns the moment); Section 01 pages re-flipped to module order (Page 1 = identity through links, Page 2 = what-you-do/creative/referrals/enneagram/other-tests); mic glyph bumped tertiary→secondary + one-time "tap to speak" hint (localStorage `nobc-apply-mic-hint`); group sub-fields (`.apply-group-grid`) collapse to single column under 600px. Submission/scoring/consents/reveal still byte-for-byte. **Rhythm + contrast polish (2026-06-22):** inter-field gap tightened 48→32px (single `fieldGroup` scale) and the double-gap after group blocks removed (group sub-fields now use grid `row-gap` — 28px desktop / 18px mobile — instead of their own margin); mic tap target padded to 44×44 (glyph unmoved); reveal "BY NIGHT" copy bumped `night.muted`→`night.text` for dark-mode legibility (token only, copy/`archetypes.ts` untouched). Submission/scoring/consents/reveal logic still byte-for-byte. **Adam approved shipping the full rebuild to production 2026-06-22 — deploying via `vercel --prod`.** Presentation + structure only; submission, scoring, consent byte-for-byte (verified). Two follow-ups OUTSIDE `/apply` before the new questions are fully wired: (1) operator review labels in `lib/legacy-answer-labels.ts` for the new answer keys; (2) the DB `ApplicationTemplate` QuestionDefinitions still describe the old questions, so scoring runs fail-safe but is not yet tuned to the new set. Adam deploys via `vercel --prod --archive=tgz`. Prior: Launch-hardening landed on `feat/apply-hardening` (BLOCKERs 1–5 from FULL-AUDIT-2026-06-21): sender display name → "The No Bad Company" across all transactional sends; submit + create idempotency guards; in-codebase per-IP rate limit (`publicRateLimit`) on both public apply POSTs; photo-upload failures now surfaced to the applicant. **Decisions for Adam:** (1) **rate-limiting** is in-memory per-instance (resets on cold start) — decide whether to add Vercel WAF or an Upstash shared store for production-grade distributed limiting (FLAGGED, no infra added); (2) the optional durable dedup index in `prisma/sql/apply-dedup-partial-unique.sql` (partial-unique on PENDING `(workspaceId, lower(email))`) is **NOT applied** — review + apply by hand if wanted (code already P2002-defensive without it). Prior threads unchanged: apply `prisma/sql/application-backup.sql` + set `GOOGLE_DRIVE_*`, then merge `feat/application-backup`; reconcile the three competing answer-key generations. |

## Scope

This stage owns everything from the moment a person lands on `/apply` to the moment their `Application` row is written with archetype + personalized copy. It does **not** own approval workflow (that's `02-approval`).

## Files in play

```
app/apply/page.tsx                              ← server wrapper + Phase C state-aware router (5 signed-in states; pure reads)
app/apply/layout.tsx                            ← pins /apply to data-theme="nobc" (theme-leak lock) + Phase C UserButton auth-chrome
app/m/_components/ApplicantStatus.tsx           ← (Stage 02 component) Phase C: presentational ApplicantStatusView extracted; reused by the /apply router for the submitted/decided states
app/apply/_lib/questions.ts                     ← the 40-question set (incl. the `photo` question) + 3 sections, single source of truth
lib/apply-photo-mirror.ts                       ← post-PATCH DAM mirror: applicant photos → Asset rows in the auto-created "Applications" folder (best-effort, zero schema change)
app/apply/_components/MembershipForm.tsx        ← module-driven 3-section client form (rebuild branch; was 8-screen)
app/apply/_components/FroggerGame.tsx           ← South Congress easter egg
app/api/apply/membership/route.ts               ← POST: create draft Application
app/api/apply/membership/[id]/route.ts          ← GET + PATCH: read/update draft
app/api/apply/membership/[id]/submit/route.ts   ← POST: score-first + ONE write tx under the advisory lock (Option B, 2026-07-20); after() backup hook
scripts/verify-submit-atomicity.ts              ← dev-only proof harness for the submit tx boundary (host-guarded to Neon dev; stubs scoring/resend/auth; 28 assertions)
app/api/apply/membership/upload/route.ts        ← photo upload to private R2 (tenant via resolveDefaultApplyWorkspace — same resolver as create; P0 fix 2026-07-02)
tests/unit/apply-upload-workspace.test.ts       ← regression: upload key prefix must follow the create route's resolver, never a bare findFirst
config/archetypes.ts                            ← ALL archetype copy lives here
lib/scoring.ts                                  ← Member Worth axes + threshold logic
scripts/fix-archetype-scores-scale.ts           ← one-time backfill: archetypeScores 0–1 → 0–100 (run 2026-05-21)
lib/applications/backup.ts                       ← application-backup core: serialize + dependency-free Google Drive adapter + fail-closed orchestrator
app/api/cron/backup-applications/route.ts        ← hourly reconciliation cron (CRON_SECRET-gated)
prisma/sql/application-backup.sql                ← additive migration: BackupStatus enum + ApplicationBackup ledger (apply by hand, never db push)
prisma/sql/apply-dedup-partial-unique.sql        ← OPTIONAL additive partial-unique index hardening submit idempotency (NOT applied; code is P2002-defensive without it)
prisma/sql/apply-scoring-v2-reconcile-2026-07.sql ← 2026-07-08: guarded reconcile — strike taste model, re-assert canonical 13; tap-guarded, zero DELETEs (RUN in prod)
lib/public-rate-limit.ts                         ← per-IP limiter, now per-bucket + configurable (apply create/PATCH/submit, access submit; v1.1 → Upstash)
lib/apply-draft-token.ts                         ← 2026-06-23: httpOnly signed cookie binding draft GET/PATCH/submit to the creating browser (closes the ?id= IDOR)
lib/cron-auth.ts                                 ← 2026-06-23: fail-closed, timing-safe CRON_SECRET check shared by all cron routes
lib/question-key-map.ts                          ← 2026-06-23: rewritten bridge (seed stableKeys → current form keys, array-join support)
app/api/healthz/route.ts                         ← 2026-06-23: liveness probe (200 / 503 on DB reachability)
tests/unit/question-key-map.test.ts              ← 2026-06-23: scoring key-resolution guard (would have caught the stale-map regression)
lib/applications/approve.ts                       ← (Stage 02) welcome-email send — sender display name fixed to "The No Bad Company"
tests/unit/apply-submit-route.test.ts            ← submit route: idempotency + rate-limit + branch coverage
tests/unit/apply-create-route.test.ts            ← create route: dedup + P2002 recovery + rate-limit
tests/unit/apply-hardening.test.ts               ← sender-name + photo-failure source-scan invariants
app/review/application/page.tsx                  ← Chloe review tool: dark-link page (Clerk via middleware '/review(.*)'), loads the saved review state
app/review/application/ReviewClient.tsx          ← ported review UI: 3 tabs, click-to-edit cards, status buttons, debounced autosave, Export/Import
app/review/application/data.ts                   ← SEED + NATURES ported verbatim (dim/edge fields excluded — positive-framing rule)
app/review/application/actions.ts                ← server action: Clerk-gated upsert of the single "main" ApplicationReviewState row
app/review/application/review.css                ← ported stylesheet, arv--prefixed and scoped to the tool
```

## Schema models owned

- **Application** (form data + scoring outputs), **ApplicationAnswer** (per-question payloads, including the `_photos` system key)
- **ApplicationTemplate** (form variant definitions)
- **QuestionDefinition** (the canonical question library — APPLY_QUESTIONS lives here when surfaced via DB)
- **ApplicationBackup** (one-per-application durable-backup ledger: status/checksum/externalId/attempts) + **BackupStatus** enum (PENDING/DONE/FAILED)
- **ApplicationReviewState** (Chloe review tool: single JSON row keyed `"main"` — table not yet created in Neon; additive SQL awaiting Adam)

## Inputs

- Public visitor (no auth required)
- Optional `?id=xxx` query param to resume a draft

## Outputs

- `Application` row with: 8 screens of data, `archetype`, `archetypeScores` (JSON), `personalizedCopy`, 3-axis worth scores, binary tags
- Photo URLs in Vercel Blob

## The 8 screens

1. **The Basics** — name, email, phone, city/neighborhood, where from originally, birthday, links, referrers (up to 3)
2. **Real Questions** — working on, obsessed with, what people call you about
3. **Your World** — most interesting people, time you connected two people, community loyalty
4. **Taste** — place that gets details right, whose taste you trust, what you recommend, splurge vs save
5. **Rapid Fire** — karaoke song, coffee table, busy during the day, sunday morning, social link, something most people don't know
6. **Photos** — 1 required up to 5, candid over headshot, food/accessibility field
7. **Legal** — full waiver, single checkbox to unlock submit
8. **Reveal** — archetype name + story, spectrum bars, tags, next event card, share buttons, Frogger easter egg

## The six archetypes

All copy lives in `config/archetypes.ts`. Each has: `name`, `dayStory`, `nightStory`, `oneLiner`, `tags`, `sponsorSegments`.

| Archetype | Energy | Sponsor Segments |
|---|---|---|
| Connector | Relationships as currency, thinks two steps ahead | Premium travel, members clubs, executive services |
| Host | Sets the table before anyone asks | Spirits, F&B, hospitality tech, home |
| Curator | Shares the one thing worth your time | Fashion, beauty, luxury goods, hotels |
| Builder | Ships things, blank page is just Tuesday | B2B SaaS, fintech, business banking |
| Maker | Made something this week, can't not | Creative tools, instruments, fashion |
| Patron | Opens doors quietly, doesn't need credit | Wealth mgmt, real estate, watches, automotive |

## AI scoring (sequential)

On submit:
1. **Scoring call** — Claude Sonnet reads all answers, returns archetype assignment + spectrum scores (0–100 per archetype). Stored in `Application.archetype` and `Application.archetypeScores`.
2. **Personalization call** — reads archetype + all answers, generates 2–3 sentences specific to this applicant. Stored in `Application.personalizedCopy`.

## Member Worth scoring (post-AI)

Three axes 1–10, stored in `Application`:

- **Influence** — social links + content questions + what people come to you for
- **Contribution** — connection/intro question + community loyalty
- **Activation** — rapid fire + sunday morning + karaoke

Total /30. Thresholds: **22+ Charter candidate**, **16–21 Standard**, **<16 waitlist**.

Auto-applied binary tags: `Founder`, `ContentCreator`, `HospitalityOperator`, `Investor`, `Press`, `B2BDecisionMaker`.

## Day/Night toggle

- Day: bg `#f9f7f2`, accent `#B22E21` (NBC Red)
- Night: bg `#1a1520`, accent `#7F77DD` (purple)
- Reveal screen toggles between `dayStory` and `nightStory`
- Badge: "your archetype" → "your archetype — after dark"

## Rules — DO NOT VIOLATE

1. **Do not simplify the form.** 8 screens, 30+ questions. The depth is the product.
2. **Do not modify legal copy without attorney review.** Screen 7 waiver is a draft pending legal sign-off.
3. **Never hardcode archetype text in components.** All copy lives in `config/archetypes.ts`. Edit there, never inline.
4. **Save/resume is required.** Draft saves to DB on every step advance. Never break this.
5. **No auth on `/apply`.** It's a public route.
6. **Photos go to Vercel Blob.** `app/api/apply/membership/upload/route.ts` calls `@vercel/blob`'s `put()`, which reads `BLOB_READ_WRITE_TOKEN` from the environment automatically — there is no `process.env.BLOB_READ_WRITE_TOKEN` reference in code. Set the token in Vercel; do not switch storage providers without a migration plan. (The DAM in Stage 15 is a separate, R2-only pipeline; this rule only governs `/apply` photo uploads.)

## Easter egg: South Congress Frogger

Triggered by "still with us?" at bottom of reveal. Canvas game:
- Dark Austin night aesthetic
- "I love you so much" mural at top
- Storefronts: Guero's, Hopdoddy, Home Slice
- Vehicles: Tesla (red `#CC3333`), Waymo (blue `#3366BB` labeled WAYMO), Food trucks (TACOS)
- S Congress Ave labeled on median
- Death: "got got on soco."
- Win: "you made it. welcome to austin."

## Known issues / backlog

**Three competing answer-key generations** — needs a dedicated cleanup pass (backlog, do not fix piecemeal):

1. **Live form (authoritative):** `MembershipForm.tsx` writes dotted `section.field` keys to `ApplicationAnswer` — `basics.*`, `personality.*`, `community.*`, `taste.*`, `rapid.*`, `about.*`, `photos.*`. This is what a genuine `/apply` submission actually produces. The operator UI resolves labels for these via `lib/legacy-answer-labels.ts`.
2. **`lib/apply-config.ts` (drifted):** uses bare camelCase keys that **do not exist in the live form** — `greatEnergy`, `learnedThisYear`, `meetPeople`, `priorEvent`, `referrer2/3/4`, `food`, `accessibility`, `consentMembershipRead`, `consentPhotos`. It's still the source for the queue's answer ordering and some labels, so it silently no-ops on real submissions.
3. **`lib/question-key-map.ts` (legacy bridge):** maps canonical `QuestionDefinition.stableKey` values (`real_working_on`, `world_connected_people`, …) to the **older** `real.*` / `world.*` dotted keys — **not** the live form's current `personality.*` / `community.*` keys. So question-agnostic scoring pairs definitions against keys the live form no longer writes → a **latent coverage gap on real submissions**.

Net: three key vocabularies (`personality.*` live → `real.*` legacy → `real_working_on` canonical) describe overlapping questions, and nothing fully reconciles them. The demo seed (`lib/dev/demo-applications.ts`) now emits generation #1 (the real live-form keys) so demo data matches production, but the apply-config/question-key-map drift remains. **Flag: dedicated reconciliation pass before relying on question-agnostic scoring for live applicants.**

## What this stage does NOT own

- Approval workflow / welcome email → `02-approval/`
- Red List + duplicate handling on submit → `02-approval/`
- Operator review UI → `07-operator-dashboard/`
- Sending the welcome SMS → V1.5. (House Phone is owned by `14-house-phone/` + the external Railway service; the Runtype-based "House Phone trigger" in Stage 11 was scratched.)
