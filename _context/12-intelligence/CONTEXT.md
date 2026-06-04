# Stage 12 — Intelligence & Insights

> Sponsor-facing intelligence product. Aggregates application, member, event, and Access data into a queryable metric registry, on-demand drill-downs, AI-narrated insights, and saved reports. **This is the moat.** Treat its scope with care.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped (base + sponsor dashboard v1 + **Sponsor Intelligence layer Phases 0/1/2** — Activation Recap, brand-lift surveys, activation loop, pre-sale Audience Intelligence Brief; on `feat/sponsor-intelligence`, PR open / **not merged**). The one-sheeter export (was "deferred to V1.5") is now live. |
| **V1 item** | #27 (Intelligence system) |
| **Last updated** | 2026-06-01 |
| **Owner** | Adam |
| **Blocked on** | **2026-06-01: nothing hard-blocking the Sponsor Intelligence layer.** Flagged for Adam (non-blocking, documented): (1) embedding the commercial brand fonts (PP Editorial New / Neue Haas Grotesk) into externally-distributed sponsor PDFs is a font-licensing question separate from web `@font-face` use — confirm before distributing at scale; (2) the influence-tier mapping folds **Host → Connector** (no clean 5th tier) — confirm before it hardens into sponsor language; (3) the Sponsor Brief fields (`declaredObjectives`/`targetPersonaCriteria`/`rightsFeeCents`) live on `SponsorBrandProfile` (brand-level) because there is **no `EventSponsor` model** — per-event briefs are a future additive model. Local `.env.local` has empty `R2_*` values so the PDF upload no-ops locally (works on Vercel where `R2_*` is set). — Earlier: Sponsor pilot definition. The Sponsor Intelligence **page** (`/operator/intelligence/sponsor`) is **ADMIN-only** (`requireRolePage(ADMIN)`, PR #19), safe now that the Clerk-org-aware role floor (`getEffectiveRole`) treats a Clerk org admin as ADMIN even with no `WorkspaceMember` row; its "Sponsors" **nav** item keeps `adminOnly` and matches. The `/api/intelligence/{compose,reports}` POST routes are `requireRole(STAFF)`; GET reads stay open to any resolved member. |
| **Next** | **2026-06-01: Sponsor Intelligence layer (Phases 0/1/2) built on `feat/sponsor-intelligence` — one PR, open, not merged.** Phase 0 = Activation Recap generator (editorial 5-page PDF from first-party event data: objectives checklist, equivalent-media-value 3-tier table, influence-tier audience, scan-rate-by-tier activation, DAM photo-proof deliverables, renewal close; R2 + password-gated magic link at `/doc/[token]`; Recap Studio at `/operator/intelligence/recap`). Phase 1 = brand-lift surveys (`SurveyResponse`, PRE/POST question sets, Resend dispatch, public `/survey/[token]`, top-box lift/recall/NPS/conversation → recap Affinity goes live). Phase 2 = activation loop (sponsor booth form `/activation/[token]` → CRM opt-in rate → recap Acquisition) + pre-sale Audience Intelligence Brief (`/api/intelligence/audience-brief`, workspace audience deep-dive + persona match + historical EMV projection, same magic-link delivery; wired the previously-stubbed "Generate One-Sheeter"). Three additive migrations applied to prod via `prisma db execute` (the false-drift `Asset_searchVector_idx` DROP stripped each time; GIN index verified intact). tsc clean · `next build` passes · 58 unit tests pass. **Literal next action:** review + merge the PR, then on the Vercel **preview** generate a recap from Recap Studio (Vercel has `R2_*`/`RESEND_API_KEY`/`ANTHROPIC_API_KEY` set) to confirm the magic-link PDF download + survey-email send work live; remove the `__demo_recap`-tagged demo rows with `npx tsx scripts/seed-sponsor-recap.ts --clean` when no longer needed for the demo. — **2026-05-26: Sponsor dashboard layout refinement.** Fixed dead vertical space from the grid-cols-12 panels: Network Capital is now two bands — Row 1 pairs the hero + quote (left) with Multiplier Tiers (right, balanced/short), Row 2 renders Community Composition + Shared Archetype Profile full-width as a 2-up below it (moved out of the hero row, which had stretched the short left column to match the tall right). Retention follows the same shape (hero ‖ stat trio in Row 1; Attendance Distribution full-width below). Sentiment dropped the 2-column grid for a header row (eyebrow + Regenerate) above a full-width narrative. Also bumped sponsor-view typography (size only): `SectionLabel` eyebrows 11px/0.22em → 12px/0.26em, bar-row labels 13px → 15px, bar values 12px → 14px. — Earlier same day: **Sponsor dashboard polish (3 fixes).** (1) Community Composition now strips internal `__`-prefixed seed tags (`__demo`, `__demo-tenur`, `__demo-tenur-attendee`) so they never reach the sponsor-facing view. (2) Reworked all three panels (Network Capital, Retention & Velocity, Sentiment) from a cramped `max-w-2xl` left strip into a full-width 2-column grid (`lg:grid-cols-12`, hero/heading left · bars/visual right) — layout only, aesthetic unchanged. (3) Added a graceful Network Capital empty state: until any member carries a `networkCapitalScore`, the multiplier tiers render "Multiplier scoring activates as referral data accrues" (and the `0%` referral line is hidden) instead of broken zero bars; the `127 approved members` hero stays. **Literal next action:** run `scripts/backfill-referrals.ts` against prod so the Multiplier Tiers + referral line populate with real data and the empty state yields to live scoring. — Earlier backlog: surface the referral/engagement data layer in the dashboard (network-capital tile + engagement timeline) and build the sponsor-facing dashboard per the NoBC Intelligence pilot spec; optionally run `scripts/backfill-referrals.ts` so the panels show real referral data (they currently render with empty/zero data). **2026-05-26: applied the PR #8 schema migration to production** — `Member.networkCapitalScore`/`referredByMemberId` + sponsor-intelligence fields + the `MemberEngagementEvent` table/enum had never reached prod (the migrate ledger stops at `20260524000000`; the PR #8 SQL had never been run against prod), which is why all three Sponsor panels errored ("could not be loaded" / "Narrative unavailable"). Applied the additive SQL via `prisma db execute` against the Neon connection (per the root `CLAUDE.md` "Schema changes: never `prisma db push`" rule — `db push` would drop `Asset_searchVector_idx`); verified columns/table exist and panel queries no longer throw. Going forward, any new model/field this stage adds follows the same path: edit `schema.prisma` → `prisma generate` → `prisma migrate diff` to review SQL → `prisma db execute` with additive SQL only. `prisma db push` is not acceptable in this repo. Also added `console.error` on rejected `allSettled` panel results so a swallowed panel failure is never invisible again. (2026-05-26: **fixed the Sponsor dashboard RBAC-drift redirect** — `/operator/intelligence/sponsor` was `requireRolePage(ADMIN)`, which silently redirected a Clerk org admin with no `WorkspaceMember` row to `/operator`; same bug class as the House Phone fix, PR #15. Now gated by Clerk org membership (`auth()` + `getMemberWorkspaceId`); the page is reachable by any workspace org member, and the `adminOnly` "Sponsors" nav item is shown via the Clerk-org-aware role floor (`getEffectiveRole`, 2026-05-26) so a Clerk org admin sees it without a `WorkspaceMember` row. Workspace scoping unchanged. Also 2026-05-26: fixed the **Application Funnel percentages** (`lib/intelligence/metrics/pipeline/application-funnel.ts`) — First RSVP / Repeat now count approved *applicants* (a nested subset of Approved) rather than all approved members, so the funnel reads 0–100% (was First RSVP 1045%); and gated `/api/intelligence/{compose,reports}` POST to STAFF. 2026-05-25, PR #6: shipped the **House Phone tab** — inbound-SMS analytics + AI topic categorization, surfaced in `IntelligenceView`. 2026-05-25: added the **referral/engagement data layer** — `MemberEngagementEvent` log + `Member.networkCapitalScore`/`referredByMemberId` + sponsor-intelligence fields, scored by `lib/network-capital.ts` and written fire-and-forget by `lib/engagement.ts`; not yet surfaced in the dashboard. Run `scripts/backfill-referrals.ts` to populate referral links from `Application.referredBy`. 2026-05-25: shipped the **Sponsor Intelligence dashboard** at `/operator/intelligence/sponsor` — Network Capital + Retention & Velocity panels (server, parallel queries, per-panel isolation) + an AI-narrated Sentiment & Alignment panel. Remaining: wire the "Generate One-Sheeter" export (toasts "coming in V1.5"), and apply `requireRole` to the `/api/intelligence/*` API routes.) |

## Scope

The operator-facing Intelligence dashboard and the underlying metric registry are live. What this stage still owns:
- Application funnel + member constellation views (live)
- Metric registry, filters, drill-down panel, narrated InsightCards (live)
- Composer endpoint that turns natural-language questions into saved reports (live)
- AI-narrated nightly insight generation via cron (live)
- **The sponsor-facing surface** — a productized view of the same registry, scoped to a sponsor's contracted segments, with deck-export. (Partial — pilot spec pending.)
- **House Phone tab** (live, PR #6) — inbound-SMS volume/response analytics + AI topic categorization, rendered in the Intelligence dashboard. Reads House Phone data (Stage 14) via dedicated `/api/sms/*` routes, not the metric registry.
- Demo data generator that lets us preview the experience without real signals

## Files in play

```
app/operator/intelligence/page.tsx                                  ← page shell, funnel + constellation loaders
app/operator/intelligence/loading.tsx                               ← route-level skeleton
app/operator/intelligence/_components/IntelligenceView.tsx          ← top-level layout (tabs + tiles + drill; hosts the House Phone tab)
app/operator/intelligence/_components/HousePhonePanel.tsx           ← House Phone tab UI (PR #6) — SMS analytics + topic mix
app/api/sms/analytics/route.ts                                      ← GET House Phone analytics (workspace-scoped; no role gate, per House Phone spec)
app/api/sms/categorize/route.ts                                     ← GET batch topic-categorize inbound SMS → SmsMessage.category (model: claude-haiku-4-5, authorized exception)
app/operator/intelligence/_components/FilterBar.tsx                 ← time range + segment filters
app/operator/intelligence/_components/MetricTile.tsx                ← single metric card
app/operator/intelligence/_components/DrillDownPanel.tsx            ← slide-over with chart + table
app/operator/intelligence/_components/InsightCard.tsx               ← AI-narrated insight row
app/operator/intelligence/_components/ApplicationFunnel.tsx         ← funnel + cards toggle
app/operator/intelligence/_components/MemberConstellation.tsx       ← approved-member archetype map
app/operator/intelligence/_components/charts.tsx                    ← chart primitives
app/api/intelligence/compose/route.ts                               ← natural-language → saved report
app/api/intelligence/reports/route.ts                               ← list/read/delete saved reports
app/api/cron/intelligence-insights/route.ts                         ← nightly AI insight generation
lib/intelligence/index.ts                                           ← public surface
lib/intelligence/registry.ts                                        ← metric registry + dispatcher
lib/intelligence/composer.ts                                        ← Claude-driven composer logic
lib/intelligence/insight-generator.ts                               ← nightly narrator
lib/intelligence/filters.ts                                         ← encode/parse/buildContext
lib/intelligence/sponsor-targets.ts                                 ← sponsor segment matching
lib/intelligence/types.ts                                           ← Metric / Tile / FilterState types
lib/intelligence/metrics/                                           ← per-metric runners (pipeline, community, etc.)
lib/intelligence/BACKLOG.md                                         ← metric ideas not yet in registry
lib/demo-data.ts                                                    ← synthetic dataset for the demo flag
lib/network-capital.ts                                              ← network-capital scoring (referral graph → Member.networkCapitalScore); compute(memberId) + refreshAll(workspaceId)
lib/engagement.ts                                                   ← fire-and-forget MemberEngagementEvent writer (logEngagementEvent); wired into RSVP-confirm, waitlist-join, check-in
scripts/backfill-referrals.ts                                       ← one-time backfill: Application.referredBy (name) → Member.referredByMemberId
app/operator/intelligence/sponsor/page.tsx                          ← Sponsor Intelligence dashboard (server; Clerk-org-membership auth via auth() + getMemberWorkspaceId, NOT requireRolePage; parallel loaders + per-panel isolation + empty state)
app/operator/intelligence/sponsor/actions.ts                        ← 'use server' getAudienceNarrative (unstable_cache 1h) + regenerate; AI narrative via @ai-sdk/anthropic (Haiku — Adam-authorized per-feature, see note)
app/operator/intelligence/sponsor/_components/SentimentPanel.tsx    ← Panel 3 (client) — AI narrative + Regenerate
app/operator/intelligence/sponsor/_components/SponsorBriefBar.tsx   ← bottom bar (client) — "Generate One-Sheeter" → POST /api/intelligence/audience-brief (live)

# Sponsor Intelligence layer (2026-06-01, feat/sponsor-intelligence — Phases 0/1/2)
lib/intelligence/recap-types.ts            ← shared recap/brief payload types (distinct from the Metric Registry types.ts)
lib/intelligence/influence-tiers.ts        ← archetype→influence-tier map (Patron→Founder … Host→Connector); QUALIFIED_EXEC_TIERS
lib/intelligence/metrics.ts                ← computeAudienceMetrics (event) + computeWorkspaceAudience (brief); PII-safe, MIN_CELL=5 suppression
lib/intelligence/equivalent-media-value.ts ← 3-tier EMV ($2.5k/lead, $300–700 dinner parity, LinkedIn/Tribeza CPM, <60% downshift)
lib/intelligence/recap-format.ts           ← money/percent humanizers
lib/intelligence/recap-narrative.ts        ← Haiku recap prose (authorized exception #3) + deterministic fallback
lib/intelligence/deliverables.ts           ← DAM photo-proof embedding (presign + sharp → base64 data URI)
lib/intelligence/recap-assemble.ts         ← assembles the RecapPayload; auto-computes affinity + acquisition
lib/intelligence/survey.ts                 ← PRE/POST question sets + computeBrandLift (top-box lift, recall, NPS, conversation, quotes)
lib/intelligence/activation.ts             ← booth questions + computeAcquisition + booth-link GeneratedAsset helpers
lib/intelligence/brief-assemble.ts         ← pre-sale brief → RecapPayload(kind brief): audience deep-dive + match + historical EMV projection
lib/intelligence/recap-delivery.ts         ← storeAndDeliver (R2 + GeneratedAsset magic link) + generateAndStoreRecap / generateAndStoreBrief
lib/intelligence/recap-resolve.ts          ← resolve a /doc magic-link token (+ password cookie)
lib/pdf/palette.ts                         ← PDF color palette (ONLY sanctioned hex literals, from CSS tokens)
lib/pdf/fonts.ts                           ← brand TTF registration (PP Editorial New / Neue Haas)
lib/pdf/recap-document.tsx                 ← 5-page editorial Activation Recap (@react-pdf)
lib/pdf/brief-document.tsx                 ← 3-page editorial Audience Intelligence Brief (@react-pdf)
lib/pdf/render.tsx                         ← renderRecapPdf / renderDocPdf (chooses document by kind)
app/api/intelligence/activation-recap/route.ts  ← POST (STAFF) generate recap
app/api/intelligence/survey/route.ts             ← POST (STAFF) dispatch brand-lift survey via Resend
app/api/intelligence/booth-link/route.ts         ← POST (STAFF) mint sponsor booth QR link
app/api/intelligence/audience-brief/route.ts     ← POST (STAFF) generate pre-sale brief
app/api/doc/[token]/auth/route.ts                ← POST password gate (scrypt + HttpOnly cookie)
app/api/doc/[token]/download/route.ts            ← GET signed-R2 PDF download (expiry + cookie enforced)
app/api/survey/[token]/route.ts                  ← POST public survey submit (token-gated, phase-scoped)
app/api/activation/[token]/route.ts              ← POST public booth interaction submit
app/doc/[token]/page.tsx + DocPasswordForm.tsx   ← magic-link recap/brief landing + password gate
app/survey/[token]/page.tsx + SurveyForm.tsx     ← public brand-lift survey (form reused by /activation)
app/activation/[token]/page.tsx                  ← public sponsor booth surface
app/operator/intelligence/recap/page.tsx + actions.ts + _components/RecapStudio.tsx  ← Recap Studio (ADMIN): Brief intake + generate + survey/booth/brief triggers
prisma/sql/sponsor-intel-p0.sql / p1.sql / p2.sql ← the reviewed additive migrations applied to prod
scripts/seed-sponsor-recap.ts              ← demo seed (tagged __demo_recap) that drives the real pipeline end-to-end
tests/unit/intelligence/equivalent-media-value.test.ts ← EMV + tier-mapping unit tests
```

## Inputs

- Operator visiting `/operator/intelligence`
- Operator agent calling intelligence MCP tools (future)
- Sponsor-facing surface request (future)
- `?demo=true` URL flag → reads from `lib/demo-data.ts` instead of live workspace data
- Nightly cron at `/api/cron/intelligence-insights` (writes `IntelligenceInsight` rows)

## Outputs

- Metric tiles with formatted numbers, deltas, and (optional) chart payloads
- `IntelligenceInsight` rows generated nightly
- `SavedReport` rows from composer
- AuditEvent rows on report create / delete

## Schema models

- **IntelligenceInsight**: workspaceId, metricId, narrative, delta (JSON), generatedAt, acknowledged
- **SavedReport**: workspaceId, name, question, metricIds (String[]), filters (JSON), createdById, createdAt, lastRunAt
- **SponsorBrandProfile**: sponsor metadata used by `lib/intelligence/sponsor-targets.ts` for segment matching. (2026-06-01: + Sponsor Brief intake fields `declaredObjectives` (String?), `targetPersonaCriteria` (Json?), `rightsFeeCents` (Int?).)
- **RecapSnapshot** (2026-06-01): reproducible frozen metrics behind each Activation Recap PDF — workspaceId, eventId (soft FK), sponsorBrandId?, metrics (Json), mediaValueInputs (Json), generatedAt/generatedBySession. Indexed on workspaceId/eventId/sponsorBrandId.
- **SurveyResponse** (2026-06-01): brand-lift + activation responses — workspaceId, eventId (soft FK), sponsorBrandId?, memberId?, phase (`SurveyPhase` enum PRE|POST|ACTIVATION — new CREATE TYPE), token? (public submit link), answers (Json), sentAt?/submittedAt?. Indexed on workspaceId/eventId/sponsorBrandId/memberId.
- **GeneratedAsset** (reused): `type` String now carries `"activation_recap"`, `"audience_intelligence_brief"`, `"activation_booth"`; `pdfUrl` = R2 object key; `magicLinkUrl` = 256-bit token; `payload` = `{ recap, access: { passwordHash } }`.
- **EventCustomQuestion** (2026-06-01): + `sponsorBrandId` (String?) → a question can be scoped to a sponsor's at-activation booth form.
- **MemberEngagementEvent** (2026-05-25): append-only engagement log — workspaceId, memberId, eventType (`MemberEngagementEventType` enum), eventId?, metadata (JSON), occurredAt. Raw signal feed for future engagement/network metrics.
- **Member** intelligence fields (2026-05-25): `referredByMemberId` (self-relation → referral graph), `networkCapitalScore` (Float, from `lib/network-capital.ts`), and sponsor-intelligence fields `industry` / `jobFunction` / `seniority` / `companySize` / `ageRange` / `householdIncome`. (Distinct from the pre-existing `networkValueScore Int`.)

## Rules — DO NOT VIOLATE

1. **The metric registry is the single source of truth.** Dashboard, agent, sponsor-facing surface, and deck exports all read from `lib/intelligence/registry.ts`. Never compute a metric inline in a page or component.
2. **Workspace-scoped end-to-end.** Every metric runner builds its context via `buildContext(workspaceId, filters)` — no global aggregates, no cross-tenant reads.
3. **Demo mode is a UI flag, never a data substitute in production paths.** `?demo=true` swaps the source via `lib/demo-data.ts`; never branch on demo inside a metric runner.
4. **Empty states are first-class.** Every tile and view must have a defined empty state (see ApplicationFunnel's "No signals yet" pattern). Sponsor decks read better with honest empties than fabricated numbers.
5. **AI narration is bounded.** `insight-generator.ts` uses claude-sonnet-4-20250514, no model substitution. Narratives are short (1–2 sentences) and never invent numbers — only describe what the metric returned. (Exception: the House Phone SMS **categorizer** in `/api/sms/categorize` uses `claude-haiku-4-5-20251001` — an explicit Adam-authorized exception for cheap high-volume SMS classification, documented in root CLAUDE.md → Locked Decisions. It does not relax the lock on the registry/narrator.) (2026-05-25: the **Sponsor dashboard's** Sentiment & Alignment narrative — `app/operator/intelligence/sponsor/actions.ts` — also uses `claude-haiku-4-5-20251001` — now a documented authorized Haiku exception #2 in root CLAUDE.md → Locked Decisions, alongside House Phone SMS.) (2026-06-01: the **Activation Recap prose narrative** — `lib/intelligence/recap-narrative.ts` — also uses `claude-haiku-4-5-20251001`, an Adam-authorized exception #3 for this build. It only writes prose AROUND numbers computed in code, with a deterministic templated fallback when the key is unset; it never produces a figure. The pre-sale brief prose is fully templated — no model call.)
6. **Sponsor-scoped surface (when shipped) cannot expose individual member PII.** Aggregates and segments only. Member detail stays in `07-operator-dashboard/`.

## Audit findings — authorization (2026-05-21, code-verified, read-only)

`app/api/intelligence/compose/route.ts:9-12` and `app/api/intelligence/reports/route.ts:11,25` gate on `auth()` (401 if anon) + `requireWorkspaceId` only — **no operator role check**. Any user in the workspace's Clerk org can run the natural-language composer and read/delete saved reports, which surface member-derived aggregates. Rule #6 below (sponsor surface exposes no individual PII) governs the *future* sponsor-facing product; it does **not** gate these operator-facing intelligence APIs today. Full analysis + the fix outline live in `07-operator-dashboard` (Audit findings — authorization gap); apply that RBAC helper here when it lands.

## What this stage does NOT own

- Application + scoring data sourcing → `01-apply/`
- Member directory + per-member detail → `07-operator-dashboard/`
- Audit log → `07-operator-dashboard/`
- The operator AI chat panel that consumes these metrics → `09-ai-chat/`
- MCP tool definitions that expose metrics to the master agent → `08-mcp-server/`
