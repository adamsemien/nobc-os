# Stage 01 — Apply

> Membership application form, AI archetype scoring, and reveal screen.

## Status

| Field | Value |
|---|---|
| **State** | ✅ **LIVE in production + merged to `main` (2026-06-22)** — the full rebuild (editorial redesign + 6 chapter-pages + progress bar + localStorage resume + speech-to-text + mobile/rhythm polish + copy cleanup) was deployed to prod via `vercel --prod` from `feat/apply-rebuild-redesign` (aliased to thenobadcompany.com / app. / www. / nobc-os.vercel.app). The branch was then merged to `main` (origin/main = branch tip `8f6ff13`), so git matches production. Final copy pass: removed the "attorney review" disclaimer line from the legal screen, and swept all em dashes out of rendered copy (waiver header, tab title, and `config/archetypes.ts` narrative strings — copy-only, Adam-authorized). (+ application-backup feature code-complete, dormant on a branch) **(+ Phase C front-door — branch `feat/apply-front-door`, committed/unmerged: state-aware `/apply` routing for the 5 signed-in states (door / resume draft / "application received" / approved→`/m` / decided→graceful) + a `UserButton` auth-chrome on the apply layout. Reads state only — no schema change, no NEW DB write. Deploys later WITH the Phase B consent dual-write branch, NOT yet in prod.)** |
| **V1 item** | #1, #5 |
| **Last updated** | 2026-06-30 |
| **Owner** | Adam |
| **Blocked on** | Nothing — shipped to production and merged to `main`. Outstanding follow-ups: (a) the two items OUTSIDE `/apply` so AI scoring is tuned to the new questions (operator review labels in `lib/legacy-answer-labels.ts`; DB `ApplicationTemplate` QuestionDefinitions) — scoring currently runs fail-safe, not tuned; (b) **reveal "YOUR STORY" duplicate (flagged 2026-06-22, NOT fixed):** `personalizedStory = submitResult?.personalizedCopy \|\| dayStory` (`MembershipForm.tsx:758`) renders the AI `personalizedCopy` in the YOUR STORY slot with a `dayStory` fallback. There is **no `yourStory` field** in `config/archetypes.ts` (fields are name/oneLiner/dayStory/nightStory/tags/sponsorSegments/spectrumDescription). So when `personalizedCopy` is empty/blank, YOUR STORY echoes BY DAY verbatim. Per Adam's instruction no narrative copy was invented. Adam to decide: supply a static `yourStory` per archetype + wire `personalizedCopy \|\| yourStory`, OR hide the block when `personalizedCopy` is empty, OR investigate why `personalizedCopy` comes back empty (the personalization call in `app/api/apply/membership/[id]/submit` — is it populating reliably in prod?). **→ 2026-06-23: the YOUR STORY duplicate is now FIXED in code** (`MembershipForm.tsx` — `personalizedStory` no longer falls back to `dayStory`; the block renders only when AI `personalizedCopy` is non-empty). **NEW BLOCKER (P0-DATA, needs Adam):** the live DB has **0 `ApplicationTemplate` rows and 0 `QuestionDefinition` rows** and `workspace.defaultTemplateId` is NULL, so `scoreApplication` (`lib/scoring.ts`) finds no scored questions and scores every applicant on their **name alone** — scoring is structurally void, not merely untuned. The code half is fixed (`lib/question-key-map.ts` rewritten to bridge the seed's stableKeys → current form keys + a guard test), but scoring stays void until the template + questions are seeded to prod (`scripts/seed-questions.mjs`). Seeding defines how real applicants are judged → reserved for Adam's sign-off (ties to the "swap apply questions" task). **Phase C front-door (`feat/apply-front-door`): nothing blocking — Pass 1 (routing + chrome) committed; the whole branch deploys WITH the Phase B consent dual-write, not before.** |
| **Next** | **Phase C front-door — Pass 1 DONE (2026-06-30), branch `feat/apply-front-door` (off `feat/apply-consent-fields` @ `1a64649`):** state-aware routing + auth chrome. `app/apply/page.tsx` now routes the signed-in caller by application state — (a) signed-out / (b) signed-in no-app → the account+consent gate; (c) PENDING draft (`aiScore===null`) → resume the form via `?id=`; (d) submitted (`aiScore!==null`) → presentational "Application received."; (e) APPROVED member → `redirect('/m')`; decided (REJECTED/WAITLISTED/HOLD) → graceful "thank you" (never the door). Member detection is a PURE READ on `Application{clerkUserId, status:'APPROVED'}` (legacy-anonymous-approved miss is an accepted gap, self-heals on `/m`). A new presentational `ApplicantStatusView` was extracted from `ApplicantStatus` so `/apply` renders the card from router-computed props WITHOUT triggering the self-contained member-claim fallback (`getMemberPortalContext`, which writes). `app/apply/layout.tsx` gained a fixed `UserButton` (sign-out + switch-account) for signed-in applicants. `tsc` + eslint clean; committed, NOT pushed/merged/deployed. **Pass 2+ accumulate on this same branch.** — PRIOR: **Apply rebuild + flow overhaul in review** (branch `feat/apply-rebuild-redesign`, not merged): theme-leak lock (`app/apply/layout.tsx`) + module-driven 3-section 39-question form (`app/apply/_lib/questions.ts` = single source of truth) + editorial redesign + cosmetic fixes (indicator placement, toast removed, label/answer contrast). **Flow overhaul (2026-06-22):** re-paginated 19 → 6 chapter-pages via an explicit `CHAPTER_PAGE_IDS` map in `MembershipForm.tsx` (12·3·6·5·8·5 = 39; same questions/order/copy, layout-only — note the explicit grouping puts referrals+enneagram on Page 1 and idealSaturday+workout on Page 5, a minor adjacency shift from the module's interleave); global progress bar anchored to the header nav (replaces the quiet 01/03 corner indicator, which is removed); `localStorage` draft-resume keyed `nobc-apply-draft` (persist on advance, restore-prompt on load, clear on submit via a `submitResult` watcher so `handleSubmit` stays byte-for-byte); speech-to-text mic button (Web Speech API, additive) on long-form textareas only, hidden where unsupported; native autofill/dictation glyphs suppressed via `.apply-form` webkit-pseudo CSS. Submission/scoring/consents/reveal byte-for-byte. **Mobile polish pass (2026-06-22):** legal title now PP Editorial italic (was sans); repeated big serif section title demoted to the eyebrow on non-first pages of a section (interstitial owns the moment); Section 01 pages re-flipped to module order (Page 1 = identity through links, Page 2 = what-you-do/creative/referrals/enneagram/other-tests); mic glyph bumped tertiary→secondary + one-time "tap to speak" hint (localStorage `nobc-apply-mic-hint`); group sub-fields (`.apply-group-grid`) collapse to single column under 600px. Submission/scoring/consents/reveal still byte-for-byte. **Rhythm + contrast polish (2026-06-22):** inter-field gap tightened 48→32px (single `fieldGroup` scale) and the double-gap after group blocks removed (group sub-fields now use grid `row-gap` — 28px desktop / 18px mobile — instead of their own margin); mic tap target padded to 44×44 (glyph unmoved); reveal "BY NIGHT" copy bumped `night.muted`→`night.text` for dark-mode legibility (token only, copy/`archetypes.ts` untouched). Submission/scoring/consents/reveal logic still byte-for-byte. **Adam approved shipping the full rebuild to production 2026-06-22 — deploying via `vercel --prod`.** Presentation + structure only; submission, scoring, consent byte-for-byte (verified). Two follow-ups OUTSIDE `/apply` before the new questions are fully wired: (1) operator review labels in `lib/legacy-answer-labels.ts` for the new answer keys; (2) the DB `ApplicationTemplate` QuestionDefinitions still describe the old questions, so scoring runs fail-safe but is not yet tuned to the new set. Adam deploys via `vercel --prod --archive=tgz`. Prior: Launch-hardening landed on `feat/apply-hardening` (BLOCKERs 1–5 from FULL-AUDIT-2026-06-21): sender display name → "The No Bad Company" across all transactional sends; submit + create idempotency guards; in-codebase per-IP rate limit (`publicRateLimit`) on both public apply POSTs; photo-upload failures now surfaced to the applicant. **Decisions for Adam:** (1) **rate-limiting** is in-memory per-instance (resets on cold start) — decide whether to add Vercel WAF or an Upstash shared store for production-grade distributed limiting (FLAGGED, no infra added); (2) the optional durable dedup index in `prisma/sql/apply-dedup-partial-unique.sql` (partial-unique on PENDING `(workspaceId, lower(email))`) is **NOT applied** — review + apply by hand if wanted (code already P2002-defensive without it). Prior threads unchanged: apply `prisma/sql/application-backup.sql` + set `GOOGLE_DRIVE_*`, then merge `feat/application-backup`; reconcile the three competing answer-key generations. |

## Scope

This stage owns everything from the moment a person lands on `/apply` to the moment their `Application` row is written with archetype + personalized copy. It does **not** own approval workflow (that's `02-approval`).

## Files in play

```
app/apply/page.tsx                              ← server wrapper + Phase C state-aware router (5 signed-in states; pure reads)
app/apply/layout.tsx                            ← pins /apply to data-theme="nobc" (theme-leak lock) + Phase C UserButton auth-chrome
app/m/_components/ApplicantStatus.tsx           ← (Stage 02 component) Phase C: presentational ApplicantStatusView extracted; reused by the /apply router for the submitted/decided states
app/apply/_lib/questions.ts                     ← the 39-question set + 3 sections, single source of truth (rebuild branch)
app/apply/_components/MembershipForm.tsx        ← module-driven 3-section client form (rebuild branch; was 8-screen)
app/apply/_components/FroggerGame.tsx           ← South Congress easter egg
app/api/apply/membership/route.ts               ← POST: create draft Application
app/api/apply/membership/[id]/route.ts          ← GET + PATCH: read/update draft
app/api/apply/membership/[id]/submit/route.ts   ← POST: dual Claude calls + after() backup hook
app/api/apply/membership/upload/route.ts        ← photo upload to private R2
config/archetypes.ts                            ← ALL archetype copy lives here
lib/scoring.ts                                  ← Member Worth axes + threshold logic
scripts/fix-archetype-scores-scale.ts           ← one-time backfill: archetypeScores 0–1 → 0–100 (run 2026-05-21)
lib/applications/backup.ts                       ← application-backup core: serialize + dependency-free Google Drive adapter + fail-closed orchestrator
app/api/cron/backup-applications/route.ts        ← hourly reconciliation cron (CRON_SECRET-gated)
prisma/sql/application-backup.sql                ← additive migration: BackupStatus enum + ApplicationBackup ledger (apply by hand, never db push)
prisma/sql/apply-dedup-partial-unique.sql        ← OPTIONAL additive partial-unique index hardening submit idempotency (NOT applied; code is P2002-defensive without it)
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
```

## Schema models owned

- **Application** (form data + scoring outputs), **ApplicationAnswer** (per-question payloads, including the `_photos` system key)
- **ApplicationTemplate** (form variant definitions)
- **QuestionDefinition** (the canonical question library — APPLY_QUESTIONS lives here when surfaced via DB)
- **ApplicationBackup** (one-per-application durable-backup ledger: status/checksum/externalId/attempts) + **BackupStatus** enum (PENDING/DONE/FAILED)

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
