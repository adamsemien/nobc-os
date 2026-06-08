# Ground-Truth Reconciliation — 2026-05-28

> Read-only audit of `_context/*/CONTEXT.md` + `CLAUDE.md` against the live tree. Branch: `claude/sync-context-2026-05-28`. No code or context files were edited to produce this report.

---

## 1. PR Ledger

40 PRs total. **38 merged, 1 closed (#9, superseded by #10), 2 open (#39, #40).**

| # | State | Merged | Title (truncated) |
|---|---|---|---|
| 1 | MERGED | 2026-05-23 | feat: House Phone SMS inbox + member-page access & flow fixes |
| 2 | MERGED | 2026-05-24 | feat(house-phone): inline tap-to-edit contact name in thread header |
| 3 | MERGED | 2026-05-24 | feat(events): editorial-luxury redesign of member event pages |
| 4 | MERGED | 2026-05-25 | feat(members): manual member creation with duplicate-check |
| 5 | MERGED | 2026-05-25 | feat(roles): operator roles & permissions (ADMIN/STAFF/READ_ONLY) |
| 6 | MERGED | 2026-05-25 | feat(analytics): House Phone Intelligence tab |
| 7 | MERGED | 2026-05-25 | docs: update CLAUDE.md + stage context files for May 2026 session |
| 8 | MERGED | 2026-05-25 | feat(schema): referral linkage, network capital, engagement events |
| 9 | CLOSED | — | feat(intelligence): sponsor intelligence dashboard (superseded by #10) |
| 10 | MERGED | 2026-05-25 | feat(intelligence): sponsor intelligence dashboard |
| 11 | MERGED | 2026-05-25 | fix(auth): route protection audit, Add Member fixes, Intelligence nav |
| 12 | MERGED | 2026-05-25 | fix(auth): operator route protection audit + RBAC rollout |
| 13 | MERGED | 2026-05-26 | fix(auth): resolve workspace by active Clerk org, not first membership |
| 14 | MERGED | 2026-05-26 | chore(debug): temporary /api/debug/whoami resolver diagnostic |
| 15 | MERGED | 2026-05-26 | fix(house-phone): authorize by Clerk org membership |
| 16 | MERGED | 2026-05-26 | chore(debug): remove temporary /api/debug/whoami diagnostic |
| 17 | MERGED | 2026-05-26 | docs: House Phone authorizes by Clerk org membership |
| 18 | MERGED | 2026-05-26 | fix(intelligence): Sponsor dashboard authorizes by Clerk org membership |
| 19 | MERGED | 2026-05-26 | Intelligence + RBAC fixes: funnel math, Clerk-org role floor, AI-route gating |
| 20 | MERGED | 2026-05-26 | fix(intelligence): log swallowed Sponsor panel failures |
| 21 | MERGED | 2026-05-26 | fix(intelligence): rework Sponsor dashboard layout, hide demo tags |
| 22 | MERGED | 2026-05-26 | fix(intelligence): refine Sponsor dashboard IA |
| 23 | MERGED | 2026-05-26 | feat(events): rebuild Split template to 50/50 + hero-photo replace fix |
| 24 | MERGED | 2026-05-26 | fix(events): Split post-merge review |
| 25 | MERGED | 2026-05-27 | fix(events): bring Editorial below-fold to parity with Split |
| 26 | MERGED | 2026-05-26 | feat(media): DAM Phase 1 — R2 storage + schema foundation |
| 27 | MERGED | 2026-05-27 | feat(media): DAM Phase 2a — operator grid foundation |
| 28 | MERGED | 2026-05-26 | fix(applications): widen review detail panel on wide viewports |
| 29 | MERGED | 2026-05-27 | feat(media): DAM Phase 2b — grid interactions + world-class upload |
| 30 | MERGED | 2026-05-27 | feat(media): HEIC ingest — convert HEIC→JPEG on upload |
| 31 | MERGED | 2026-05-27 | fix(media): operator-grid polish |
| 32 | MERGED | 2026-05-27 | feat(dam): dev seed script for demo media (Pexels) |
| 33 | MERGED | 2026-05-27 | feat(settings): add Developer section linking to DevToolbar |
| 34 | MERGED | 2026-05-27 | fix(operator): full-width data pages |
| 35 | MERGED | 2026-05-27 | fix(help): remove unimplemented keyboard shortcuts from help copy |
| 36 | MERGED | 2026-05-28 | feat(devtoolbar): add Shortcuts cheat-sheet section |
| 37 | MERGED | 2026-05-28 | feat(devtoolbar): add Clear Demo Media button + DELETE /api/dev/seed-dam |
| 38 | MERGED | 2026-05-28 | feat(dam): add watermark + allowedDownloads to ShareLink |
| 39 | **OPEN** | — | feat(dam): Phase 4 — external share surfaces (sponsor + member gallery) |
| 40 | **OPEN** | — | chore(context): sync all CONTEXT.md files to 2026-05-28 state |

### 1a. PRs MISSING from CLAUDE.md's May-2026 session log

The PR #40 edit added PRs #1–#6, #26–#39 to the log. Still NOT mentioned by number:

- **PR #1** — earliest House Phone work. CLAUDE.md narrates House Phone but doesn't cite #1.
- **PR #2** — inline tap-to-edit contact name. Not in CLAUDE.md or Stage 14.
- **PRs #7, #8** — docs sync (#7) and the schema fields for sponsor/network-capital (#8). #8 is critical (referral/engagement layer) and is mentioned in Stage 12 but not CLAUDE.md.
- **PR #9 (closed)** — superseded by #10. Mention not required, but the log doesn't note the supersession.
- **PR #10** — Sponsor Intelligence dashboard. Documented in Stage 12, missing from CLAUDE.md.
- **PRs #11, #12** — operator route-protection / RBAC rollout. Documented in Stage 07, missing from CLAUDE.md.
- **PRs #13–#22** — bundled by CLAUDE.md as "PRs #7–#22" but individual numbers not cited. PRs #14 + #16 are paired debug-add/remove and reasonable to omit; PRs #15, #17, #18, #19, #20, #21, #22 each shipped substantive Sponsor/RBAC/House-Phone fixes.

### 1b. PRs CLAIMED by CLAUDE.md that don't exist or don't match

None. Every PR cited in the updated CLAUDE.md (#1, #3, #4, #5, #6, #26–#39) is real.

> The block "PRs #7–#22" in CLAUDE.md is a range shorthand — accurate for the merged set but loses the granular attribution Stage 07/12/14 carry.

---

## 2. Removals (the blind spot)

### 2a. Deleted files (5 across all history)

| Commit | Date | File | Why it died |
|---|---|---|---|
| `1ab246e` | 2026-05-26 | `app/api/debug/whoami/route.ts` | Temporary RBAC diagnostic, removed once the Clerk-org fix landed. |
| `261a927` | 2026-05-21 | `app/operator/_components/dashboard/StatColumn.tsx` | Replaced by `StatFigure.tsx` in the liquid-editorial dashboard redesign. **Stage 07 documents the rename.** |
| `78043bb` | 2026-05-19 | `app/api/agent/chat/route.ts` | Replaced by the streaming `app/api/agent/route.ts` (SSE loop). Stage 09 doesn't call out the old path. |
| `78043bb` | 2026-05-19 | `app/operator/_components/AiChatPanel.tsx` | Renamed to `AgentPanel.tsx` (current). Stage 09 lists `AgentPanel.tsx`. |
| `78043bb` | 2026-05-19 | `app/operator/events/_components/EventBuilderButton.tsx` | Folded into the new Agent panel. Stage 09/10 don't mention. |
| `f02dd0e` | 2026-05-15 | `app/operator/events/new/_components/GateRadio.tsx` | Replaced by the visual flow builder. Stage 03 doesn't mention. |
| `436361e` | 2026-05-12 | `lib/apply-questions.ts` | Replaced by `lib/legacy-answer-labels.ts` + `config/archetypes.ts`. **Stage 01 documents both successors and flags `lib/question-key-map.ts` as a drifted vestige; the deleted file is not called out by name but its successors are.** |

**CONTEXT references to removed paths:** none of the five deleted paths still appear anywhere in `_context/` or `CLAUDE.md`. Clean.

### 2b. Schema removals (3 distinct, all from the same refactor)

Single removal commit: **`b23ab8a` (2026-05-20) — refactor(access-mode): remove apply_or_pay**.

| Kind | Removed | Replacement |
|---|---|---|
| enum value | `EventAccessMode.APPLY_OR_PAY` | Expressed as `TICKETED` + `approvalRequired: true` |
| enum | `EventApplyMode { APPROVAL_HOLDS_TICKET, SUBMIT_CONFIRMS_ENTRY }` (both values + enum) | None — sub-mode collapsed |
| field | `Event.applyMode EventApplyMode?` | None — the column was dropped |

**CONTEXT references to the removed schema:**
- `_context/04-access/CONTEXT.md:16` — **correctly notes** "`apply_or_pay` was removed as a standalone `AccessMode` enum value … Migration `20260520000000_remove_apply_or_pay` applied. The `applyMode` column and `EventApplyMode` enum were dropped entirely." ✓
- `CLAUDE.md:154` (in canonical terminology / never expose raw enums) — lists `apply_or_pay` as one of the raw enum values that "must always be mapped to display strings." **Stale.** The enum value no longer exists, so the example does not need scrubbing in the UI — it can't reach the UI. Worth tightening to a current value.
- All other "apply_or_pay" mentions in Stage 03/04 are either the workflow-template key (`ticketed_approval`, renamed; not the enum) or historical narrative — accurate.

> Schema-removal note: `Member.networkValueScore Int` (legacy) and `Member.networkCapitalScore Float` (added 2026-05-25) coexist. Stage 12 calls this out: "Distinct from the pre-existing `networkValueScore Int`." Not a removal yet — keep on radar.

### 2c. Env-var removals (1 confirmed)

| Env var | Last referenced | Now |
|---|---|---|
| `NEXT_PUBLIC_EVENT_MEDIA_BASE_URL` | Removed during DAM Phase-1 refactor | No `process.env.*` reference anywhere in code |
| `RUNTYPE_API_URL` / `RUNTYPE_API_KEY` | **Never lived in code as `process.env.*`** | Stage 09 notes "`RUNTYPE_API_URL` was removed from `.env.local` as dead config" |

**CONTEXT references to removed env vars:**
- `NEXT_PUBLIC_EVENT_MEDIA_BASE_URL` — **zero references** in `_context/` or `CLAUDE.md`. Clean.
- `RUNTYPE_*` — Stage 09 + CLAUDE.md describe them as V1.5-only placeholders. Intentional, not stale.

### 2d. Dependency removals (0 actual)

`git log -p package.json` shows no removed dep lines — only script-key churn (`lint`, `seed:events`, `test:e2e:headed` strings). **No package was uninstalled across history.**

This is the key finding: **`@vercel/blob` and `twilio` are still in `dependencies`**:
- `@vercel/blob` — imported at `app/api/apply/membership/upload/route.ts` and `app/api/media/upload/route.ts` (event hero). Stage 01 owns the first; Stage 03 doesn't call out the second; Stage 15 names it as out-of-scope.
- `twilio` — imported at `lib/twilio.ts`. Stage 14 + the Twilio Absolute Rule own it.
- `@passninja/passninja-js` — imported at `lib/wallet-pass.ts`. Stage 06 owns it.

No `runtype` or `tenur` package was ever in `dependencies`. Consistent with "Runtype scratched for House Phone" + "Runtype proxy in V1.5" — there was nothing to uninstall.

---

## 3. Current-Tree Truth

### 3a. Routes — 44 pages + 125 API routes (169 total)

Full list materialized to `/tmp/pages.txt` and `/tmp/routes.txt` during the audit. Grouped by stage:

- **/apply (Stage 01):** 3 pages, 5 API routes
- **/m/(portal) + /m/events + /m/pass (Stages 03/04):** 9 pages, 4 API routes
- **/check-in (Stage 06):** 1 page, 3 API routes
- **/operator (Stages 02/03/04/05/07/12/14/15):** 22 pages, ~95 API routes
- **/api/dev/* (Stage 13):** 17 API routes
- **/api/sms/* + /operator/house-phone (Stage 14):** 5 API routes + 1 page
- **/api/media/dam/* + /operator/media (Stage 15):** 8 API routes + 1 page (Phase 4: 5 more API + 3 pages on PR #39 branch only)
- **Legal (Stage 05):** 3 pages at `/privacy`, `/terms`, `/refund-policy` — **NOT at `/legal/*` as Stage 05 claims**
- **/qa-panel (Stage 13):** 1 page
- **Webhooks (Stage 05/11):** `/api/webhooks/{nobc/stripe,stripe,producer}` — the Svix subscribe routes Stage 11 lists do not exist
- **Cron (cross-stage):** `/api/cron/{capture-payments,event-reminders,intelligence-insights}`

### 3b. Schema — 47 models + 30 enums

**Models (47):** AccessToken, AgentConversation, AgentTurn, Application, ApplicationAnswer, ApplicationTemplate, **Asset**, **AssetDownload**, AuditEvent, EmailTemplate, EntityTag, Event, EventCustomQuestion, EventFlowTemplate, EventSeries, EventWorkflow, GeneratedAsset, IntelligenceInsight, **MediaFolder**, Member, **MemberEngagementEvent**, MembershipTier, OperatorComment, OperatorNotification, Order, Payment, PlatformSetting, PromoCode, PromoRedemption, QAMission, QuestionDefinition, RedList, RSVP, SavedReport, SeriesSponsor, **ShareLink**, **SmsConversation**, **SmsMessage**, SponsorBrandProfile, Tag, Ticket, TicketHold, TicketTier, WaitlistEntry, WatchList, Workspace, **WorkspaceMember**.

**Enums (30):** AccessTokenType, AgentTurnRole, AgentTurnStatus, AiApplicationRecommendation, ApplicationStatus, **AssetFileType**, AuditActorType, DiscountType, EventAccessMode, EventStatus, EventVisibility, FieldType, **MediaFolderType**, **MemberEngagementEventType**, MemberStatus, **OperatorRole**, PaymentStatus, QuestionFlowStep, RefundPolicy, RSVPStatus, ServiceFeeMode, **ShareLinkMode**, **SmsDirection**, TagEntityType, TagSource, TicketStatus, TierTrigger, TierVisibility, WaitlistPromotion, WatchListType.

(Bolded = added during the May-2026 session.)

### 3c. Env vars referenced in code (41 unique)

```
ANTHROPIC_API_KEY               IMAGE_TAGGING_PROVIDER          R2_ACCOUNT_ID
CHECKIN_SECRET                  NEXT_PUBLIC_APP_URL             R2_EVENT_MEDIA_BUCKET
CLERK_SECRET_KEY                NEXT_PUBLIC_APPLY_SLUG          R2_SECRET_ACCESS_KEY
CLOUDFLARE_ACCOUNT_ID           NEXT_PUBLIC_CHECKIN_SECRET      RESEND_API_KEY
CLOUDFLARE_AI_API_TOKEN         NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY  SEED_WORKSPACE_ID
CLOUDFLARE_AI_IMAGE_MODEL       NEXT_PUBLIC_DEV_USER_IDS        STRIPE_SECRET_KEY
CRON_SECRET                     NEXT_PUBLIC_PRODUCER_URL        STRIPE_WEBHOOK_SECRET
DAM_SEED_WORKSPACE_SLUG         NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  SVIX_API_KEY
DAM_TAG_SECRET                  NODE_ENV                        TWILIO_ACCOUNT_SID
DATABASE_URL                    PASSNINJA_ACCOUNT_ID            TWILIO_AUTH_TOKEN
DEV_USER_IDS                    PASSNINJA_API_KEY               TWILIO_PHONE_NUMBER
GOOGLE_WALLET_CLASS_ID          PASSNINJA_PASS_TYPE
GOOGLE_WALLET_CREDENTIALS       PASSNINJA_PASS_TYPE_SLUG
GOOGLE_WALLET_ISSUER_ID         PEXELS_API_KEY
                                PRODUCER_WEBHOOK_SECRET
                                PRODUCER_WEBHOOK_URL
                                R2_ACCESS_KEY_ID
```

### 3d. Dependencies

**dependencies (41):** `@ai-sdk/anthropic`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `@clerk/nextjs`, `@dnd-kit/{core,sortable,utilities}`, `@modelcontextprotocol/sdk`, `@neondatabase/serverless`, `@passninja/passninja-js`, `@prisma/{adapter-neon,client}`, `@radix-ui/react-{checkbox,dialog,label}`, `@react-email/{components,render}`, `@stripe/{react-stripe-js,stripe-js}`, `@vercel/blob`, `@zxing/library`, `ai`, `archiver`, `blurhash`, `dexie`, `exifr`, `heic-convert`, `justified-layout`, `lucide-react`, `next`, `prisma`, `qrcode`, `react`, `react-dom`, `resend`, `rrule`, `sharp`, `stripe`, `svix`, `twilio`, `zod`.

**devDependencies (17):** `@clerk/testing`, `@eslint/eslintrc`, `@playwright/test`, `@tailwindcss/postcss`, `@types/{archiver,heic-convert,node,qrcode,react,react-dom}`, `dotenv`, `eslint`, `eslint-config-next`, `tailwindcss`, `tsx`, `typescript`, `vitest`.

---

## 4. Drift Table

### 4a. Per-stage accuracy

Stages are scored on Files-in-play accuracy (does the listed path exist?) and Routes/Models/Env mention coverage.

| Stage | Files exist? | Routes correctly named? | Schema/Env correct? | Notes |
|---|---|---|---|---|
| **01 apply** | ✓ all live | ✓ | ✓ | `BLOB_READ_WRITE_TOKEN` claimed but uses Vercel Blob default; no `process.env.BLOB_*` in code. |
| **02 approval** | ✗ `lib/email/welcome.ts`, `lib/red-list/check.ts`, `lib/duplicates/detect.ts` do not exist as named — actual welcome/red-list/dup logic lives elsewhere (`lib/applications/approve.ts`, `lib/watchlist.ts`). | ✓ | ✓ Schema fields audited correctly. | The "Files in play" block lists 3 idealized lib paths that were never created. |
| **03 events** | ✗ `app/api/events/*` routes do NOT exist — events live under `/api/operator/events`. `lib/events/access-mode.ts` and `config/event-questions.ts` also do not exist. `app/operator/events/[id]/edit/page.tsx` does not exist (the operator edit UI is `/operator/events/[id]/page.tsx`). | partial | ✓ | "Files in play" describes an aspirational `/api/events/*` surface that was never built. The real surface is `/api/operator/events/*`. |
| **04 access** | ✗ `app/api/rsvp/[id]/{approve,reject}/route.ts` do not exist (the operator approval lives at `/api/operator/rsvps/[id]/*`). `app/m/events/[slug]/rsvp/page.tsx` and `app/operator/events/[id]/rsvps/page.tsx` do not exist (`rsvps` is a tab in the parent page). `lib/rsvp/{capacity,waitlist}.ts` do not exist. | partial | ✓ | Mirror of Stage 03's drift — claimed lib + route paths never materialized. |
| **05 payments** | ✗ Legal pages are at `/privacy`, `/terms`, `/refund-policy` — NOT `/legal/*`. `/api/stripe/webhook` is acknowledged as nonexistent in CONTEXT itself. | partial | ✓ | Stage 05 already corrected the webhook path; the legal-page path is still wrong. |
| **06 wallet-checkin** | ✗ Several phantoms: `app/api/check-in/scan/route.ts`, `app/api/wallet/{apple,google}/route.ts` (real paths use `[rsvpId]`), `app/api/wallet/[rsvpId]/revoke/route.ts`, `app/check-in/page.tsx`, `lib/check-in/qr.ts`, `lib/wallet/{apple,google}-pass.ts`. | partial | partial | The PassNinja-shipped reality is well-documented; the aspirational roll-your-own pass builder paths in "Files in play" were never created. `GOOGLE_WALLET_*` env vars are claimed as unused but **are referenced in code** (Stage 06 claim contradicts Section 3c). |
| **07 operator-dashboard** | ✗ `lib/audit.ts` does not exist (no top-level audit module — audit writes happen inline). `lib/permissions.ts` already self-marked as never built. | ✓ for shipped code | ✓ | Sub-pages under `/operator/settings/{application,bug-reports,communications,lists,model,theme,tiers,webhooks}` are NOT enumerated. The settings routes also exist as APIs and aren't enumerated. See orphans below. |
| **08 mcp-server** | ✓ all live | ✓ | ✓ | Runtype HITL framing issue from prior review still present (lines 79, 99). |
| **09 ai-chat** | ✓ live; `lib/runtype/{client,sse}.ts` correctly marked "V1.5 only — not yet created" (commented). | ✓ | ✓ | `RUNTYPE_*` env vars correctly marked V1.5. |
| **10 ai-event-builder** | ✗ `app/operator/events/new/ai/{page.tsx,[sessionId]/page.tsx}`, `components/operator/EventBuilder/{Intake,Enrichment,Draft,Review}.tsx`, `lib/event-builder/prompts/` — **none exist**. Only `app/api/agent/event-builder/route.ts` + `app/api/ai/event-builder/route.ts` are real. | partial | ✓ | Stage is 🔶 Partial — matches reality. But the 7 phantom paths read as if they exist. |
| **11 producer-integration** | ✗ `app/api/webhooks/producer/send/route.ts`, `app/api/webhooks/svix/{subscribe,[id]}/route.ts`, `lib/webhooks/{phase-j,queue,svix-client}.ts` — none exist. Real paths: `/api/webhooks/producer/route.ts`, `lib/producer-webhook.ts`. | partial | partial | The aspirational helper-modules block is fiction; the actual Phase J sender is a single `lib/producer-webhook.ts`. `SVIX_APP_ID` env claimed but not referenced in code. |
| **12 intelligence** | ✓ all live (including the new sponsor surface + scripts) | ✓ | ✓ | Stage 12 admits "prod is `prisma db push`-managed" — see Section 5 for the schema-safety conflict. |
| **13 dev-tooling** | ✓ live; `scripts/seed-dam.ts` + the DevToolbar/Settings entries are correctly listed. | ✓ | partial | `PEXELS_API_KEY` + `DAM_SEED_WORKSPACE_SLUG` are referenced in `scripts/seed-dam.ts` but not documented as required env. |
| **14 house-phone** | ✓ live for nobc-os half. `lib/ai.js` references the external Railway service (cross-repo) — phantom in this tree but legitimate cross-repo pointer. | ✓ | partial | `HOUSE_PHONE_WORKSPACE_ID` claimed as required env, but **not referenced in code** (CLAUDE.md says it's "reserved" — accurate that nobc-os doesn't read it yet; the Railway service does). |
| **15 media-dam** | partial — 8 Phase-4 paths (`app/assets/[token]`, `app/gallery/[slug]`, `app/operator/media/shares`, `app/operator/media/_components/CreateShareModal.tsx`, `app/api/share/*`) are on the `claude/dam-phase-4` branch (PR #39) only. Status block correctly notes "PR #39 open / not yet merged" — but the Files-in-play block lists them as if they exist. | ✓ for merged surface | partial | Does not record that ShareLink schema fields (PR #38) were applied to prod (db execute vs db push — see Section 5). HEIC accept-filter bug correctly noted as Edge case. |

### 4b. Orphans (in tree, no CONTEXT mentions by full path)

**40 API routes + 17 pages = 57 orphans.** Grouped by stage owner:

**Stage 07 (operator dashboard) — bulk of orphans:**
- `/api/operator/check-in`, `/api/operator/counts`, `/api/operator/search`, `/api/operator/operators`
- `/api/operator/comments/{,[id]}`, `/api/operator/notifications`, `/api/operator/lists/{,[id]}`
- `/api/operator/settings/{application,communications,help-faq,model,platform,tiers,webhooks}`
- `/api/operator/event-flow-templates/{,[id]}`
- `/api/operator/series/{,[id],[id]/generate}`
- `/api/operator/{tiers,ticket-tiers}/{,[id],reorder,seed}`
- `/api/operator/intelligence/drilldown`
- `/api/operator/members/[id]`, `/api/operator/rsvps/[id]/{approve,cancel,refund,reject}`
- `/api/operator/events/{bulk-delete,[id]/{comp,promote-waitlist,rsvps,room/vibe}}`
- Pages: `/operator/check-in`, `/operator/settings/{application,bug-reports,communications,lists,model,theme,tiers,webhooks}`

**Stage 09 (AI chat):**
- `/api/ai/event-builder` (alternate to `/api/agent/event-builder`; Stage 10 lists the agent path but not this ai path)

**Stage 06 (check-in):**
- `/api/check-in/[rsvpId]`

**Stage 04 (access):**
- `/api/rsvp/cancel`

**Member portal (Stages 03/04 share):**
- `/m/(portal)/{application,help,home,profile,rsvps}` (5 pages)
- `/m/pass` (1 page — Stage 06 likely owner but not listed)
- `/apply/thanks` (Stage 01 — not listed)
- `/qa-panel` (Stage 13 — not listed)

> Most orphans are real, in-use routes. The CONTEXT files describe surfaces at a thematic level but don't enumerate every endpoint. **Stage 07 is the largest gap** — the operator dashboard has dozens of `/api/operator/*` routes the stage barely names, and 8 settings sub-pages it doesn't list.

### 4c. Phantoms (in CONTEXT, not in tree)

**56 total phantoms.** Categorized:

| Category | Count | Notes |
|---|---|---|
| Phase-4 DAM (on PR #39 branch, not main) | 8 | Soft phantoms — CONTEXT notes "PR #39 open" |
| Aspirational helper modules that were never created (`lib/email/welcome.ts`, `lib/red-list/check.ts`, `lib/rsvp/capacity.ts`, etc.) | 13 | Mostly Stages 02/04/06/11 |
| Stage-10 AI-event-builder UI files | 7 | Stage is 🔶 Partial — matches reality but reads as live |
| Wrong path / renamed routes (e.g. `/api/events/*` vs `/api/operator/events/*`; `/legal/*` vs `/{privacy,terms,refund-policy}`; `app/operator/events/[id]/edit/page.tsx`) | ~15 | Real surfaces, wrong path documented |
| Cross-repo (Stage 14's `lib/ai.js` → Railway service) | 1 | Legitimate external reference |
| V1.5 placeholders (`lib/runtype/*`) | 2 | Correctly commented as not-yet-created |
| Misc dotted notation in audit footnotes | ~10 | E.g. `app/api/.../apply-event-rsvp.ts` — informal pointer, not a literal path |

---

## 5. Storage + Schema-Safety Sanity

### 5a. Vercel Blob references (expected: zero — actual: 5, mixed verdict)

```
_context/01-apply/CONTEXT.md:29   ← legitimate (apply photos use Vercel Blob)
_context/01-apply/CONTEXT.md:49   ← legitimate
_context/01-apply/CONTEXT.md:107  ← legitimate (Rule 6: "Photos go to Vercel Blob via BLOB_READ_WRITE_TOKEN")
_context/15-media-dam/CONTEXT.md:93   ← negative rule ("No Vercel Blob in this stage")
_context/15-media-dam/CONTEXT.md:100  ← "What this stage does NOT own" pointer
```

**Verdict:** The "should be zero" expectation is **wrong** as written. Vercel Blob legitimately powers `/apply` photo uploads (Stage 01) and the legacy event-hero pipeline (Stage 03). The DAM (Stage 15) is R2-only and explicitly excludes Blob. Storage is split across two providers by design.

Stage 03 does **not** mention Vercel Blob anywhere despite `app/api/media/upload/route.ts` (its hero-upload route) calling `@vercel/blob`'s `put()` — **drift to flag.**

### 5b. R2 bucket name — `nobc-event-media` literal

**Zero hits** for the string `nobc-event-media` anywhere in `_context/` or `CLAUDE.md`. The DAM points to `process.env.R2_EVENT_MEDIA_BUCKET` (env var name documented in Stage 15 line 79) but never names the bucket value. If `nobc-event-media` is the production bucket, it is undocumented; the env-var indirection is the only documented contract.

### 5c. CLAUDE.md schema-safety rule (verbatim)

Lines 220–221:

```
### Schema changes: generate then push manually
Run `prisma generate` first. Show the diff. Never auto-push. Producer is on the same Postgres instance — schema changes are production-affecting.
```

**Verdict: VAGUE.** The block does NOT:
1. Name `prisma db push` as the forbidden command — says "Never auto-push" but doesn't name the verb.
2. Mention `Asset_searchVector_idx` (the GIN index defined in `prisma/sql/dam-search-vector.sql:22`).
3. Explain that `db push` would drop the FTS GIN index because Prisma's `Unsupported("tsvector")` field can't express the index.
4. Reference `prisma db execute` as the required alternative for the FTS migration.

The only place `prisma db execute` is named is `_context/15-media-dam/CONTEXT.md:45`.

**Additional finding — Stage 12 admits the rule is being violated in practice:**

> `_context/12-intelligence/CONTEXT.md:14` — "the migrate ledger stops at `20260524000000`; **prod is `prisma db push`-managed**, which is why all three Sponsor panels errored … Applied the additive SQL via the Neon connection (`db.$transaction`)"

Production is currently managed with `prisma db push`. The Absolute Rule says "Never auto-push." Stage 12 documents the actual workflow (db push) and one ad-hoc workaround (raw SQL via `db.$transaction`). The Absolute Rule and the documented operational reality disagree.

### 5d. Storage summary

| Provider | Used by | Schema/env contract |
|---|---|---|
| **Cloudflare R2** | DAM (Stage 15) — `Asset.url`, `Asset.thumbnailUrl`, R2 keys at `dam/{workspaceId}/{assetId}/*` | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_EVENT_MEDIA_BUCKET` (env var; bucket name not documented in CONTEXT) |
| **Vercel Blob** | `/apply` photos (Stage 01), event hero (Stage 03 — not documented) | `BLOB_READ_WRITE_TOKEN` (claimed in Stage 01, no `process.env.BLOB_*` in code — uses `@vercel/blob` defaults) |
| **PassNinja-hosted** | Apple/Google passes (Stage 06) | `PASSNINJA_API_KEY`, `PASSNINJA_ACCOUNT_ID`, `PASSNINJA_PASS_TYPE`, **`PASSNINJA_PASS_TYPE_SLUG`** (the slug variant is in code at `lib/wallet-pass.ts:8` but NOT documented in Stage 06 or CLAUDE.md) |

---

## Summary of priority fixes (for a future docs pass — NOT made in this audit)

1. **CLAUDE.md schema-safety rule** is vague — strengthen to name `prisma db push`, `Asset_searchVector_idx`, and the GIN-drop risk; reference `prisma db execute` as the required alternative; reconcile with Stage 12's admission that prod is `db push`-managed.
2. **Stage 06 GOOGLE_WALLET_* env vars** — Stage 06 claims they're "not used anywhere in code"; they ARE referenced in code (3 vars at minimum). Contradiction.
3. **Stage 06 `PASSNINJA_PASS_TYPE_SLUG`** — env var used in code (`lib/wallet-pass.ts:8`) but undocumented.
4. **Stage 03 `/api/media/upload` uses Vercel Blob** — never mentioned in Stage 03 despite living in the events ecosystem.
5. **Stage 02/03/04/06/11 phantom helper modules** — `lib/email/welcome.ts`, `lib/red-list/check.ts`, `lib/duplicates/detect.ts`, `lib/events/access-mode.ts`, `config/event-questions.ts`, `lib/rsvp/{capacity,waitlist}.ts`, `lib/check-in/qr.ts`, `lib/wallet/{apple,google}-pass.ts`, `lib/webhooks/{phase-j,queue,svix-client}.ts` — all listed as if they exist; none do. Replace with the real paths or drop.
6. **Stage 05 legal pages** — at `/privacy`, `/terms`, `/refund-policy`, NOT `/legal/*`.
7. **Stage 07** — name the 8 settings sub-pages and the ~40 `/api/operator/*` orphan routes explicitly, or accept the thematic-only framing and say so.
8. **CLAUDE.md** — `apply_or_pay` example in Canonical Terminology is stale (enum value removed in PR migration 2026-05-20).
9. **PR ledger gap** — CLAUDE.md doesn't cite PRs #2, #7, #8, #10, #11, #12, #15, #17–#22 individually; Stages 07/12/14 carry the details but the L0 router lacks the cross-reference.
10. **Stage 12 `db push` admission** — either CLAUDE.md's Absolute Rule needs to acknowledge that prod is db-push-managed plus a specific exception, or Stage 12's workflow needs to change. Today they conflict.

---

*End of report. No files were edited beyond creating this report at `_context/_audit/reconciliation-2026-05-28.md`.*
