# Stage 12 — Intelligence & Insights

> Sponsor-facing intelligence product. Aggregates application, member, event, and Access data into a queryable metric registry, on-demand drill-downs, AI-narrated insights, and saved reports. **This is the moat.** Treat its scope with care.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped (base + sponsor dashboard v1) — 🔶 Partial (sponsor-facing surface: one-sheeter export deferred to V1.5) |
| **V1 item** | #27 (Intelligence system) |
| **Last updated** | 2026-05-26 |
| **Owner** | Adam |
| **Blocked on** | Sponsor pilot definition. The Sponsor Intelligence **page** (`/operator/intelligence/sponsor`) is **ADMIN-only** (`requireRolePage(ADMIN)`, PR #19), safe now that the Clerk-org-aware role floor (`getEffectiveRole`) treats a Clerk org admin as ADMIN even with no `WorkspaceMember` row; its "Sponsors" **nav** item keeps `adminOnly` and matches. The `/api/intelligence/{compose,reports}` POST routes are `requireRole(STAFF)`; GET reads stay open to any resolved member. |
| **Next** | **2026-05-26: Sponsor dashboard layout refinement.** Fixed dead vertical space from the grid-cols-12 panels: Network Capital is now two bands — Row 1 pairs the hero + quote (left) with Multiplier Tiers (right, balanced/short), Row 2 renders Community Composition + Shared Archetype Profile full-width as a 2-up below it (moved out of the hero row, which had stretched the short left column to match the tall right). Retention follows the same shape (hero ‖ stat trio in Row 1; Attendance Distribution full-width below). Sentiment dropped the 2-column grid for a header row (eyebrow + Regenerate) above a full-width narrative. Also bumped sponsor-view typography (size only): `SectionLabel` eyebrows 11px/0.22em → 12px/0.26em, bar-row labels 13px → 15px, bar values 12px → 14px. — Earlier same day: **Sponsor dashboard polish (3 fixes).** (1) Community Composition now strips internal `__`-prefixed seed tags (`__demo`, `__demo-tenur`, `__demo-tenur-attendee`) so they never reach the sponsor-facing view. (2) Reworked all three panels (Network Capital, Retention & Velocity, Sentiment) from a cramped `max-w-2xl` left strip into a full-width 2-column grid (`lg:grid-cols-12`, hero/heading left · bars/visual right) — layout only, aesthetic unchanged. (3) Added a graceful Network Capital empty state: until any member carries a `networkCapitalScore`, the multiplier tiers render "Multiplier scoring activates as referral data accrues" (and the `0%` referral line is hidden) instead of broken zero bars; the `127 approved members` hero stays. **Literal next action:** run `scripts/backfill-referrals.ts` against prod so the Multiplier Tiers + referral line populate with real data and the empty state yields to live scoring. — Earlier backlog: surface the referral/engagement data layer in the dashboard (network-capital tile + engagement timeline) and build the sponsor-facing dashboard per the NoBC Intelligence pilot spec; optionally run `scripts/backfill-referrals.ts` so the panels show real referral data (they currently render with empty/zero data). **2026-05-26: applied the PR #8 schema migration to production** — `Member.networkCapitalScore`/`referredByMemberId` + sponsor-intelligence fields + the `MemberEngagementEvent` table/enum had never reached prod (the migrate ledger stops at `20260524000000`; the PR #8 SQL had never been run against prod), which is why all three Sponsor panels errored ("could not be loaded" / "Narrative unavailable"). Applied the additive SQL via `prisma db execute` against the Neon connection (per the root `CLAUDE.md` "Schema changes: never `prisma db push`" rule — `db push` would drop `Asset_searchVector_idx`); verified columns/table exist and panel queries no longer throw. Going forward, any new model/field this stage adds follows the same path: edit `schema.prisma` → `prisma generate` → `prisma migrate diff` to review SQL → `prisma db execute` with additive SQL only. `prisma db push` is not acceptable in this repo. Also added `console.error` on rejected `allSettled` panel results so a swallowed panel failure is never invisible again. (2026-05-26: **fixed the Sponsor dashboard RBAC-drift redirect** — `/operator/intelligence/sponsor` was `requireRolePage(ADMIN)`, which silently redirected a Clerk org admin with no `WorkspaceMember` row to `/operator`; same bug class as the House Phone fix, PR #15. Now gated by Clerk org membership (`auth()` + `getMemberWorkspaceId`); the page is reachable by any workspace org member, and the `adminOnly` "Sponsors" nav item is shown via the Clerk-org-aware role floor (`getEffectiveRole`, 2026-05-26) so a Clerk org admin sees it without a `WorkspaceMember` row. Workspace scoping unchanged. Also 2026-05-26: fixed the **Application Funnel percentages** (`lib/intelligence/metrics/pipeline/application-funnel.ts`) — First RSVP / Repeat now count approved *applicants* (a nested subset of Approved) rather than all approved members, so the funnel reads 0–100% (was First RSVP 1045%); and gated `/api/intelligence/{compose,reports}` POST to STAFF. 2026-05-25, PR #6: shipped the **House Phone tab** — inbound-SMS analytics + AI topic categorization, surfaced in `IntelligenceView`. 2026-05-25: added the **referral/engagement data layer** — `MemberEngagementEvent` log + `Member.networkCapitalScore`/`referredByMemberId` + sponsor-intelligence fields, scored by `lib/network-capital.ts` and written fire-and-forget by `lib/engagement.ts`; not yet surfaced in the dashboard. Run `scripts/backfill-referrals.ts` to populate referral links from `Application.referredBy`. 2026-05-25: shipped the **Sponsor Intelligence dashboard** at `/operator/intelligence/sponsor` — Network Capital + Retention & Velocity panels (server, parallel queries, per-panel isolation) + an AI-narrated Sentiment & Alignment panel. Remaining: wire the "Generate One-Sheeter" export (toasts "coming in V1.5"), and apply `requireRole` to the `/api/intelligence/*` API routes.) |

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
app/operator/intelligence/sponsor/_components/SponsorBriefBar.tsx   ← bottom bar (client) — "Generate One-Sheeter" → V1.5 toast
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
- **SponsorBrandProfile**: sponsor metadata used by `lib/intelligence/sponsor-targets.ts` for segment matching
- **MemberEngagementEvent** (2026-05-25): append-only engagement log — workspaceId, memberId, eventType (`MemberEngagementEventType` enum), eventId?, metadata (JSON), occurredAt. Raw signal feed for future engagement/network metrics.
- **Member** intelligence fields (2026-05-25): `referredByMemberId` (self-relation → referral graph), `networkCapitalScore` (Float, from `lib/network-capital.ts`), and sponsor-intelligence fields `industry` / `jobFunction` / `seniority` / `companySize` / `ageRange` / `householdIncome`. (Distinct from the pre-existing `networkValueScore Int`.)

## Rules — DO NOT VIOLATE

1. **The metric registry is the single source of truth.** Dashboard, agent, sponsor-facing surface, and deck exports all read from `lib/intelligence/registry.ts`. Never compute a metric inline in a page or component.
2. **Workspace-scoped end-to-end.** Every metric runner builds its context via `buildContext(workspaceId, filters)` — no global aggregates, no cross-tenant reads.
3. **Demo mode is a UI flag, never a data substitute in production paths.** `?demo=true` swaps the source via `lib/demo-data.ts`; never branch on demo inside a metric runner.
4. **Empty states are first-class.** Every tile and view must have a defined empty state (see ApplicationFunnel's "No signals yet" pattern). Sponsor decks read better with honest empties than fabricated numbers.
5. **AI narration is bounded.** `insight-generator.ts` uses claude-sonnet-4-20250514, no model substitution. Narratives are short (1–2 sentences) and never invent numbers — only describe what the metric returned. (Exception: the House Phone SMS **categorizer** in `/api/sms/categorize` uses `claude-haiku-4-5-20251001` — an explicit Adam-authorized exception for cheap high-volume SMS classification, documented in root CLAUDE.md → Locked Decisions. It does not relax the lock on the registry/narrator.) (2026-05-25: the **Sponsor dashboard's** Sentiment & Alignment narrative — `app/operator/intelligence/sponsor/actions.ts` — also uses `claude-haiku-4-5-20251001` — now a documented authorized Haiku exception #2 in root CLAUDE.md → Locked Decisions, alongside House Phone SMS.)
6. **Sponsor-scoped surface (when shipped) cannot expose individual member PII.** Aggregates and segments only. Member detail stays in `07-operator-dashboard/`.

## Audit findings — authorization (2026-05-21, code-verified, read-only)

`app/api/intelligence/compose/route.ts:9-12` and `app/api/intelligence/reports/route.ts:11,25` gate on `auth()` (401 if anon) + `requireWorkspaceId` only — **no operator role check**. Any user in the workspace's Clerk org can run the natural-language composer and read/delete saved reports, which surface member-derived aggregates. Rule #6 below (sponsor surface exposes no individual PII) governs the *future* sponsor-facing product; it does **not** gate these operator-facing intelligence APIs today. Full analysis + the fix outline live in `07-operator-dashboard` (Audit findings — authorization gap); apply that RBAC helper here when it lands.

## What this stage does NOT own

- Application + scoring data sourcing → `01-apply/`
- Member directory + per-member detail → `07-operator-dashboard/`
- Audit log → `07-operator-dashboard/`
- The operator AI chat panel that consumes these metrics → `09-ai-chat/`
- MCP tool definitions that expose metrics to the master agent → `08-mcp-server/`
