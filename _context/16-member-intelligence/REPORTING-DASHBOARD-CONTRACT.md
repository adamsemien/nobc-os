# Reporting / BI Dashboard — Implementation Contract (`/operator/intelligence`)

_Author: Lens (data/BI engineering pass). Status: **DRAFT — buildable contract.** Hardens `REPORTING-DASHBOARD-SPEC.md` (the vision) into a contract a **frontend engineer can build from** and a **data engineer can provision for**. Analysis only — **zero application code, zero migrations, nothing under `prisma/` edited.** Every schema need is **named and handed off** in §4 for a separate flux window to fold into the migration-reconciliation already in flight (`chore/reconcile-migration-history`)._

**Grounded in real code (read 2026-06-09):** `lib/intelligence/{registry,types,metrics,filters,composer,sponsor-safe}.ts`, `lib/member-editable.ts`, `app/api/intelligence/reports/route.ts`, `app/operator/intelligence/{page.tsx,_components/IntelligenceTabs.tsx}`, `prisma/schema.prisma` (Member, MemberPsychographics, FieldDefinition, SavedReport, RecapSnapshot, SurveyResponse, MemberEngagementEvent), and `_context/_audit/today-data.md`.

**Locked honored:** tokens-only (no hex), canonical terminology (Member / Guest / Comp Access / Event Access — never "RSVP" in UI; "Registration fields" = the application-form name), `claude-sonnet-4-20250514` for any AI assist, never surface raw enum values, additive-schema-only / never `prisma db push`, workspace-scoping on every read, sponsor firewall absolute.

---

## 0. Reading guide — verdicts and how to read them

Each report carries one verdict:

| Verdict | Meaning |
|---|---|
| **COMPUTABLE-NOW** | Every column/table it reads already exists in the live DB. Pure query work; ships with zero schema change. |
| **COMPUTABLE-NOW · DRIFT-DEP** | Computable today, but it reads an object that exists in prod **only via out-of-band SQL** and is **not** a tracked migration (per `today-data.md` CRITICAL). Works at runtime; flux must reconcile the object into tracked history. Names the dependency. |
| **NEEDS-SCHEMA** | Requires an additive schema change (named in §4). Not required for v1 unless founder elects the richer branch. |
| **DEFERRED** | Out of v1 by recommendation; named so it isn't silently dropped. |

**The firewall is a hard server-side branch, not a UI flag.** Every report below is classified **operator-internal** (reads `Member` directly) or **sponsor-facing** (reads the `sponsor_audience_member` view, never `Member`). The two paths never share a query. See §2.

---

## 1. Report catalog

> Refresh cadence for every report = **`live`** (registry `refresh: 'live'`, TTL 0) unless noted. These are interactive ad-hoc queries at NBC scale (hundreds–low-thousands of members); caching is a SaaS-scale concern (§4, GIN index).
>
> "Good/Bad threshold" is mostly N/A for a flexible builder (the operator picks the dimension), so it is stated only where a report has an intrinsic health signal (e.g. coverage/fill-rate).

### 1.1 Operator-internal reports (read `Member`)

#### R1 — Custom-field breakdown
- **Business question:** "Across my room, how do members break down by **{operator-defined field}**?" (e.g. neighborhood, membership tier, referral source).
- **Data source:** `Member.customFields` (jsonb) keyed by `FieldDefinition.stableKey`; `FieldDefinition` row supplies the label, `type`, and `options[]`.
- **Aggregation / query shape (OPEN-QRY-1·A, recommended):**
  ```sql
  SELECT m."customFields"->>:stableKey AS bucket, COUNT(*) AS n
  FROM "Member" m
  WHERE m."workspaceId" = :workspaceId
    AND m."mergedIntoId" IS NULL              -- never double-count soft-merged dupes
    AND m."customFields" ? :stableKey         -- key present
  GROUP BY 1 ORDER BY n DESC;
  ```
  `:stableKey` is **never** raw user input — it is resolved from an existing `FieldDefinition.stableKey` for the workspace (allow-list lookup) and is `[a-z0-9_]`-only by `slugifyFieldKey`. The value is parameterized; only the allow-listed key is interpolated. **OPEN-QRY-1·B fallback:** `db.member.findMany({ where:{ workspaceId, mergedIntoId:null }, select:{ customFields:true } })` then reduce in TypeScript (mirrors `metrics.ts`'s in-code reduce; acceptable at NBC scale).
- **Result → viz:** `Breakdown` → `horizontal-bar` (default) / `donut` (≤5 buckets). Existing `MetricResult` shape + `charts.tsx`.
- **Registry metric:** `customfield.breakdown:<stableKey>` (parametric — resolves the key at run time; adding a field never touches code).
- **Verdict:** **COMPUTABLE-NOW.**

#### R2 — Firmographic / demographic breakdown
- **Business question:** "How does my room break down by **industry / seniority / company size / job function / city / country / age range**?"
- **Data source:** First-class `Member` scalar columns (`industry`, `jobFunction`, `seniority`, `companySize`, `companyName`, `companyDomain`, `linkedinUrl`, `instagram`, `city`, `country`, `ageRange`) — the `EDITABLE_MEMBER_COLUMNS` set from `lib/member-editable.ts`. These are real columns, **not** `customFields` (the inline edit path writes the column + stamps `fieldProvenance[key]`).
- **Aggregation / query shape:** `GROUP BY` the column directly (Prisma `groupBy`, no raw SQL needed):
  ```ts
  db.member.groupBy({ by: ['industry'], where: { workspaceId, mergedIntoId: null }, _count: { _all: true } })
  ```
- **Result → viz:** `Breakdown` → `horizontal-bar` / `donut`.
- **Registry metric:** `member.breakdown:<column>` (parametric, allow-listed against `EDITABLE_MEMBER_COLUMNS`).
- **Verdict:** **COMPUTABLE-NOW.** (`Member` dimension columns exist in prod via `additive_pr2_dimensions.sql` — DRIFT-DEP at the *migration-history* level only; runtime-safe. Same drift bucket flux is already reconciling.)

#### R3 — Field coverage / fill-rate by provenance
- **Business question:** "What share of members have **{field}** set — and **how trustworthy** is it (who supplied the value)?"
- **Data source:** `Member.customFields` (presence of key) + `Member.fieldProvenance` (jsonb; `fieldProvenance[key] = { value, source, confidence?, syncedAt }`, `source ∈ ProvenanceSource`).
- **Aggregation / query shape:** % of `mergedIntoId IS NULL` members with the key present, split by `fieldProvenance[key].source` (`self_reported` / `operator_entered` / `verified_enrichment` / `ai_inferred` / `producer`). In-code reduce over the two JSON columns (the JSON sub-key split is cleaner in TS than SQL).
- **Result → viz:** `Breakdown` → `horizontal-bar` (source = trust signal).
- **Good/Bad threshold:** **fill-rate ≥ 60%** = a dimension worth reporting/segmenting on; **< 30%** = flag the field as too sparse to trust (advisory copy, not a hard gate). These are the operator's signal that a breakdown is representative.
- **Registry metric:** `customfield.coverage:<stableKey>`.
- **Verdict:** **COMPUTABLE-NOW.**

#### R4 — Cross-tab matrix (field A × field B, or field × access tier)
- **Business question:** "How does **{field A}** distribute **within each {field B}**?" (e.g. seniority × membership tier).
- **Data source:** `Member` (two `customFields` keys and/or columns). **Access tier** is **derived, not a column** — `accessTier()` in `metrics.ts`: comp → Comp; `member.status === 'GUEST'` → Guest; else → Member. Crossing by access tier therefore requires the RSVP/comp join already modeled in `metrics.ts`, not a Member column.
- **Aggregation / query shape:** two-key `GROUP BY` (raw SQL) or nested in-code reduce → `Matrix` (`MatrixRow[]`, existing shape).
- **Result → viz:** `Matrix` → `heatmap` / `table`.
- **Registry metric:** `customfield.crosstab:<keyA>:<keyB>`.
- **Verdict:** **COMPUTABLE-NOW to run ad-hoc.** **Saving** a 2-dimension report is **NEEDS-SCHEMA** only under OPEN-RPT-1·B (`reportSpec Json`, §4) — synthetic-id persistence (OPEN-RPT-1·A) cannot cleanly encode two dimensions + a chosen chart type. Recommend: ad-hoc cross-tab in v1; saved cross-tab waits on the founder's RPT-1 choice.

#### R5 — Headline scalar (members with field set)
- **Business question:** "How many members have a value for **{field}** at all?"
- **Data source:** `Member.customFields ? key` count, `mergedIntoId IS NULL`.
- **Result → viz:** scalar `number` (+ optional `sparkline`) — the tile at the top of a report.
- **Verdict:** **COMPUTABLE-NOW.**

#### R6 — Roster drill-down slice (the "View these members" expansion)
- **Business question:** "Show me the actual members behind **{this bucket}**."
- **Data source:** `Member` rows matching the clicked bucket, `mergedIntoId IS NULL`. **Does not render a roster here** — it deep-links to **`/operator/members`** with the equivalent filter (RESOLVED-IA-1: Members is the operational spine; Intelligence never becomes a second roster).
- **Result → viz:** `RecordList` → `table` (compact preview) **or** a direct link to the filtered Members surface. Operator scope shows operator columns; **sponsor scope shows firmographic columns only** (§2).
- **Registry hook:** existing `Metric.drillDown(ctx)` returns `DrillDownRecord[]`; the cell links out.
- **Verdict:** **COMPUTABLE-NOW.**

#### R7 — Existing fixed metric tiles (unchanged, listed for completeness)
- The current Community / Pipeline / Engagement / Taste tiles (`listMetrics({category})` → `runMetric`) and the application funnel (`loadFunnel` in `page.tsx`) **stay exactly as they are.** This contract **adds** the Reports builder family; it does not re-spec existing tiles. The psychographic/taste tiles remain in the **operator-only** region and never enter any sponsor path.
- **Verdict:** **COMPUTABLE-NOW (already shipped).**

#### R8 — Custom-field trend over time
- **Business question:** "How has **{field}** distribution shifted over time?"
- **Blocker:** `customFields` has **no per-value timestamp** except the approximate `fieldProvenance[key].syncedAt`. There is no clean date axis (`Member.createdAt` = when the person entered, not when the field was set).
- **Verdict:** **DEFERRED (OPEN-CHT-1).** Firmographic/pipeline time-series already exist on the main dashboard; custom-field trend is not worth a synthetic date axis in v1. Founder decides if `syncedAt`-bucketing is wanted later.

### 1.2 Sponsor-facing reports (read `sponsor_audience_member`, never `Member`)

> **Every report in this sub-section reads the `sponsor_audience_member` view, applies §2 layers 2–5, and is a SPONSOR_FACING surface (OPEN-FW-1).** None may read `Member`, `MemberPsychographics`, `Application.archetype`, `aiSummary`, `householdIncome`, notes, lists, or flags.

#### R9 — Sponsor firmographic breakdown
- **Business question:** "What does this audience look like by **industry / seniority / company size / job function / city / country / age range**?" (sponsor deliverable / preview).
- **Data source:** `sponsor_audience_member` view columns **only**: `industry, jobFunction, seniority, companySize, companyName, companyDomain, linkedinUrl, city, country, ageRange, customFields, fieldProvenance` — scoped to `status = 'APPROVED' AND mergedIntoId IS NULL` by the view itself.
- **Aggregation / query shape:** `GROUP BY` the firmographic field over the view (`db.$queryRaw` against `sponsor_audience_member` — there is **no Prisma model** for the view), then `toDistribution(counts, total)` from `metrics.ts` to apply `MIN_CELL = 5` small-cell suppression (sub-5 cells roll into a suppressed "Other").
- **Result → viz:** `Breakdown` → `horizontal-bar` with suppressed "Other" cell.
- **Verdict:** **COMPUTABLE-NOW · DRIFT-DEP.** The view exists in prod via `prisma/sql/sponsor-audience-view.sql` but is **not a tracked migration** (`today-data.md` CRITICAL) and currently has **zero runtime readers** — this report is its **first consumer**. Flux must reconcile the view into tracked history (§4-D1). Until then the report works at runtime but the migration path is the open risk.

#### R10 — Sponsor-visible custom-field breakdown
- **Business question:** "Break this audience down by **{a custom field the operator marked sponsor-visible}**."
- **Data source:** `sponsor_audience_member.customFields`, **projected down** to the allow-set = `FieldDefinition` rows where `sponsorVisible = true AND isActive = true` (load the allow-set first, then keep only those keys). The view passes `customFields` **whole** by design — projecting to `sponsorVisible` is the **reader's** job (Layer 2), and this report is that consumer.
- **Provenance restriction (Layer 4):** count a value **only** when `fieldProvenance[key].source ∈ { self_reported, verified_enrichment }`. Never `ai_inferred`, never `operator_entered`-only.
- **Aggregation / query shape:** read view → project to allow-set keys → filter by provenance → `GROUP BY` value → `toDistribution` (MIN_CELL=5).
- **Result → viz:** `Breakdown` → `horizontal-bar`, suppressed.
- **Dimension picker constraint (Layer 2):** in sponsor scope the "Break down by" picker offers **only** the `sponsorVisible` allow-set + firmographic view columns. An operator literally cannot select a non-sponsor-visible field while the sponsor-safe view is on.
- **Verdict:** **COMPUTABLE-NOW · DRIFT-DEP** (same view dependency as R9).

#### R11 — Sponsor audience headline + persona match
- **Business question:** "How big is the addressable audience, and what share matches the sponsor's persona criteria?"
- **Data source:** existing `computeWorkspaceAudience()` in `metrics.ts` (already PII-safe, suppression-aware) — **with the audit fix folded in** (see ⚠ below).
- **Verdict:** **COMPUTABLE-NOW (already shipped)** — but inherit the §2 dedup-fix requirement.
- **⚠ Required correctness fix (carried from `today-data.md` WARNING):** `metrics.ts:254` (`computeWorkspaceAudience`) filters `status:'APPROVED'` but **omits `mergedIntoId: null`**, so soft-merged duplicates inflate sponsor audience size. Any sponsor report reusing this path **MUST** add `mergedIntoId: null` to the `where` (or read the view, which already enforces it). This is the exact invariant the view was written to guarantee.

---

## 2. Firewall classification (per report)

| Report | Classification | Reads | Sponsor-safe fields it may read |
|---|---|---|---|
| R1 custom-field breakdown | operator-internal | `Member` | — (internal; any field) |
| R2 firmographic breakdown | operator-internal | `Member` | — |
| R3 coverage / provenance | operator-internal | `Member` | — |
| R4 cross-tab | operator-internal | `Member` (+derived tier) | — |
| R5 headline scalar | operator-internal | `Member` | — |
| R6 roster drill-down | operator-internal | `Member` → links to `/operator/members` | firmographic cols only **if** rendered in sponsor scope |
| R7 fixed tiles | operator-internal | registry / `Application` | — (taste/psychographic stays operator-only) |
| R8 trend | DEFERRED | — | — |
| **R9 sponsor firmographic** | **sponsor-facing** | `sponsor_audience_member` view | `industry, jobFunction, seniority, companySize, companyName, companyDomain, linkedinUrl, city, country, ageRange` |
| **R10 sponsor custom-field** | **sponsor-facing** | `sponsor_audience_member.customFields` | only keys where `FieldDefinition.sponsorVisible = true AND isActive = true`; only `self_reported` + `verified_enrichment` provenance |
| **R11 sponsor headline/persona** | **sponsor-facing** | `computeWorkspaceAudience` (+dedup fix) | firmographic + influence rollup (already PII-safe) |

**The single firewall rule (load-bearing):**
> **Operator scope** reads `Member` (and may read `MemberPsychographics` for existing internal taste tiles). **Sponsor scope** reads `sponsor_audience_member`, projects `customFields` to `sponsorVisible` keys, restricts provenance to `self_reported`+`verified_enrichment`, types every row as `SponsorAudienceMember` via `toSponsorAudienceMember`, and suppresses sub-`MIN_CELL` cells. Scope is a **server-side hard branch**, chosen on the server, never a client flag the client can flip to widen access.

**Six enforcement layers (all already have repo precedent; this contract is the first aggregation consumer of layers 2 + 4):**
1. **Physical table boundary** — psychographics live in `MemberPsychographics`; the view has no JOIN and an explicit column list.
2. **`customFields` sub-filter by `sponsorVisible`** — reader projects to the allow-set (R10). *New enforcement this contract introduces.*
3. **Type boundary** — sponsor rows typed `SponsorAudienceMember`; `_SponsorSafe` compile assertion fails the build if a psychographic key is added.
4. **Provenance restriction** — sponsor counts only `self_reported` + `verified_enrichment`. *New enforcement this contract introduces.*
5. **Small-cell suppression** — `MIN_CELL = 5` + `toDistribution` (reuse, do not re-implement).
6. **Test gate** — `tests/unit/sponsor-firewall.test.ts` source-scans the `SPONSOR_FACING` file list for psychographic read tokens.

**OPEN-FW-1 (required test change, handed off — not done here):** any **new sponsor-scope reader module** (the file assembling R9/R10/R11 output) **MUST be added to the `SPONSOR_FACING` array** in `tests/unit/sponsor-firewall.test.ts`, or the gate does not cover it. The operator-scope reader is internal and stays off the list. This is a test edit for the implementing engineer; flagged here as a build-time requirement.

**OPEN-FW-2 (founder):** is the dashboard's sponsor-safe view a **real exportable deliverable** or an **operator preview**? Recommend **preview-only** in the dashboard (still uses the full sponsor path so the preview is honest); real exportable deliverables stay in the existing `/operator/intelligence/sponsor` brief/recap pipeline (which snapshots separately into `RecapSnapshot`).

---

## 3. Custom-field reporting model — how `FieldDefinition` + `Member.customFields` drive operator-defined dimensions

This is the core property: **adding a custom field never requires a code change** (RESOLVED-EDIT-1, full customization). The parametric metric resolves any active `FieldDefinition` at run time.

### 3.1 The reportable universe of a field
A field is reportable iff it has a `FieldDefinition` row. That row is the **single source of metadata** a report needs to aggregate over the field:

| `FieldDefinition` field | Reporting role |
|---|---|
| `stableKey` | the jsonb key (`customFields->>stableKey`); the allow-list token validated before any interpolation |
| `name` | the human label on the chart/axis (never expose the raw key) |
| `type` | drives the **default chart** (OPEN-CHT-2): `select`/`enum` → donut/bar; free-text → top-N bar + "Other"; number → bucketed bar (no histogram viz in v1) |
| `options[]` | the known bucket set for a `select` — lets the chart show zero-count options and order them stably |
| `section` | groups fields in the "Break down by" picker |
| `sponsorVisible` | **the firewall flag** — gates whether the field appears in sponsor-scope dimension picker + aggregates (Layer 2) |
| `isActive` | inactive fields drop out of the picker (still readable for historical saved reports) |

### 3.2 The dimension picker (generated, never hand-listed)
"Break down by" = **`EDITABLE_MEMBER_COLUMNS`** (real firmographic columns, from `lib/member-editable.ts`) **+** active `FieldDefinition`s (custom keys). It is **generated from those two sources**, so it can never offer a firewalled key:
- **Excluded by construction:** `RESERVED_FIELD_KEYS` (archetype/psychographic — never a valid `stableKey`, rejected by both the PATCH path and FieldDefinition CRUD) and identity/computed `READONLY_MEMBER_KEYS` that make no sense as a dimension.
- **In sponsor scope:** further restricted to `sponsorVisible` custom keys + firmographic view columns (Layer 2).

### 3.3 Provenance-aware aggregation
`fieldProvenance[key] = { value, source, confidence?, syncedAt }`, `source ∈ ProvenanceSource` (`sponsor-safe.ts` — single source of truth; the report layer **reads** it, never re-defines it). Operator scope **may** segment by source (R3); sponsor scope **must** restrict to `self_reported` + `verified_enrichment` (Layer 4).

### 3.4 Why this is a registry metric family, not a parallel engine
Implementing the three parametric metrics (`customfield.breakdown`, `customfield.crosstab`, `customfield.coverage`) as registry metrics inherits **for free**: workspace-scope enforcement (`registerMetric` refuses a query that never references `workspaceId`), `refresh`-TTL caching, `drillDown`, and MCP exposure (`mcpExposed`). Reuse over fork — matches the registry's stated contract ("adding a metric must never require a UI change").

---

## 4. Schema Needs for Flux (additive-only — SPEC for flux, no SQL written here)

> **Recommended v1 path = ZERO new schema.** R1–R11 (minus deferred R8 and the saved-cross-tab case) ship on the **existing** `SavedReport` model and `/api/intelligence/reports` route, reusing `metricIds String[]` via synthetic ids (OPEN-RPT-1·A). The items below are (a) **drift reconciliation** the sponsor path depends on, and (b) **optional** additive changes gated on founder decisions. Flux owns the migration; this section is the spec.

### D1 — [DEPENDENCY · reconcile, do not create] `sponsor_audience_member` view
- **What:** the existing `prisma/sql/sponsor-audience-view.sql` view (JOIN-free, explicit column list, `status='APPROVED' AND mergedIntoId IS NULL`).
- **Action for flux:** **reconcile into tracked migration history** (it exists in prod, untracked — `today-data.md` CRITICAL). Do **not** re-create. Record via the resolve-as-applied path the migration-reconciliation window is already using.
- **Why:** R9/R10/R11 are the **first runtime consumers** of this view. The sponsor firewall's defense-in-depth depends on it being a stable, tracked object.
- **Indexes:** none new (the view reads `Member`, already `@@index([workspaceId])`, `@@index([mergedIntoId])`).

### D2 — [DEPENDENCY · reconcile] `Member` dimension columns + `FieldDefinition` + `MemberPsychographics`
- **What:** `Member.customFields/fieldProvenance/city/country/companyName/companyDomain/linkedinUrl/instagram/ageRange/...`, the `FieldDefinition` table, the `MemberPsychographics` table — all live in prod via `additive_pr2_dimensions.sql`, untracked.
- **Action for flux:** reconcile into tracked history (same CRITICAL bucket). No DDL change — record-as-applied only.
- **Why:** R1–R3, R10 read these. Runtime-safe today; the risk is purely migration-history drift.

### D3 — [OPTIONAL · NEEDS-SCHEMA, gated on OPEN-RPT-1·B] `SavedReport.reportSpec`
- **Table:** `SavedReport` (already tracked).
- **Column:** `reportSpec Json?` — **nullable, additive.**
- **Shape stored:** `{ dimension: string, measure: 'count'|'percent'|'coverage', breakdownBy?: string, segment?: object, viz?: MetricViz, scope: 'operator'|'sponsor' }`.
- **Indexes:** none.
- **Why:** lets a **multi-dimension** report (R4 cross-tab) and a **saved chart type** persist cleanly. Synthetic-id encoding (RPT-1·A) cannot represent two dimensions + a chosen viz.
- **Migration path:** edit `schema.prisma` → `prisma generate` → `prisma migrate diff --script` and **review** (refuse any DROP/ALTER TYPE/RENAME) → apply with `prisma db execute --file` → **record as a tracked, resolved migration** (per the reconciliation discipline). Never `db push`, never `--accept-data-loss`, never touch `Asset_searchVector_idx`.
- **Status:** **not needed for v1** if founder takes RPT-1·A. Build only if cross-tab/saved-chart-type is wanted.

### D4 — [OPTIONAL · additive · out-of-band, gated on OPEN-QRY-1·A at SaaS scale] GIN index on `Member.customFields`
- **What:** `CREATE INDEX CONCURRENTLY IF NOT EXISTS "Member_customFields_idx" ON "Member" USING GIN ("customFields" jsonb_path_ops);`
- **Class:** same out-of-band class as `Asset_searchVector_idx` — hand-applied SQL via `db execute`, **and** (per the reconciliation fix) recorded as a tracked migration so history stops drifting. Decide whether to also express it in `schema.prisma` as `@@index([customFields], type: Gin)` (Prisma *can* represent a GIN index on a `Json` column — unlike the tsvector case, this one is not forced out-of-band by a type limitation; founder/flux choice for consistency vs convention).
- **Why:** speeds `customFields ? key` / `->>` key-existence + extraction (R1, R5, R10) when membership grows to SaaS scale.
- **Status:** **not needed at NBC scale** (hundreds–low-thousands; in-code reduce or un-indexed `GROUP BY` is fine). Flag for the first large tenant.

### D5 — [OPTIONAL · DEFERRED] pre-aggregation materialized view
- **What:** a per-workspace `(stableKey, bucket, n)` materialized rollup of custom-field counts, refreshed nightly.
- **Why / when:** only if interactive `GROUP BY` over `customFields` becomes too slow at large scale **and** D4's GIN index is insufficient. **Not in v1.** Named so it isn't reinvented later.

**Net for v1 (recommended):** D1 + D2 are **reconciliation, not new schema** (flux is already doing this). D3/D4/D5 are **optional and gated**. The buildable v1 contract is **zero net-new schema**.

---

## 5. UI surface map (`/operator/intelligence`)

### 5.1 Where it sits
`/operator/intelligence` is the hub (RESOLVED-IA-1). Add a **`Reports` tab** to `IntelligenceTabs.tsx` (today: Community / Sponsors* / Recap Studio*; *=admin-only). The Reports tab is the custom-field builder; it sits **alongside** the existing tabs and the firewalled `/operator/intelligence/sponsor` sub-route.

```
/operator/intelligence
├── Community ............................. existing tiles + funnel + constellation (unchanged)
├── Reports (NEW) ......................... the custom-field builder
│     ├── Build panel    (Break down by · Measure · Filter)
│     ├── Result canvas  (chart + table + 1-line insight)
│     ├── Save report → SavedReport (POST /api/intelligence/reports, STAFF)
│     ├── Saved reports list (GET /api/intelligence/reports)
│     └── drill-down cell → /operator/members slice  ·  → Settings field setup
├── Sponsors* ............................. FIREWALLED (existing brief/recap pipeline)
└── Recap Studio* ........................ existing
```

- **Tab visibility:** Reports is visible to any resolved member (read-only run); **Save** is STAFF (existing `POST /reports` gate). The **sponsor-safe toggle** inside Reports re-runs through the sponsor path (firewall, not RBAC, is the boundary).
- **Routing:** the builder composes against the **live URL filter-state** (`lib/intelligence/filters.ts` — `parseFilters`/`encodeFilters`/`buildContext`), so every composed view is **shareable by link**. Extend `IntelligenceFilterState` with the report dimension/measure + a custom-field `field=value` filter, all URL-encoded (no new client state store).

### 5.2 The three controls (a breadboard, not a BI cockpit)
1. **Break down by** — dropdown = `EDITABLE_MEMBER_COLUMNS` + active `FieldDefinition`s (§3.2). Interactive.
2. **Measure** — `Members` (count, default) · `Share of members` (percent). `Coverage / fill-rate` is R3 (v1: count + percent + coverage). Interactive.
3. **Filter** — existing `IntelligenceFilterState` (date range, tier, source, neighborhood, compare) + a custom-field equals/in filter. Interactive, URL-persisted.

Optional second dimension → cross-tab (R4), gated behind OPEN-RPT-1·B for **saving**.

### 5.3 Render targets per report

| Report | Renders | Interactive vs static |
|---|---|---|
| R1, R2 breakdown | Result canvas — `horizontal-bar`/`donut` via `charts.tsx` | interactive (re-runs on control change) |
| R3 coverage | Result canvas — `horizontal-bar` by provenance | interactive |
| R4 cross-tab | Result canvas — `heatmap`/`table` | interactive (save gated on RPT-1·B) |
| R5 headline | top-of-canvas `number` tile + `sparkline` | static within a run |
| R6 drill-down | inline `table` preview + **"View these members"** link → `/operator/members` | interactive (click-through) |
| R7 fixed tiles | existing Community tab | unchanged |
| R9/R10/R11 sponsor | same canvas with **sponsor-safe view ON** — suppressed cells, firmographic-only picker | interactive; export gating per OPEN-FW-2 |
| Saved reports list | list of `{ name, question, Last run {relative} }` rows (GET /reports) | interactive (open → re-run live) |

### 5.4 States (Form-spec vocabulary; tokens-only; locked terminology)
- **Empty (no custom fields defined):** `No custom fields yet.` + link `Set up member fields` (→ Settings → member-fields). Builder still offers firmographic dimensions, so it is never wholly empty.
- **Empty (field defined, no values captured):** `No members have a value for "{field}" yet.`
- **Suppressed-only (sponsor scope, every cell < MIN_CELL):** `Not enough members to report without identifying individuals.` (never render a 1–4 person cell in sponsor scope).
- **Loading:** server-rendered tiles; 2-line skeleton bars (`--muted`), **no spinners** (Form spec).
- **Error:** `Could not run this report.` — and **the catch block logs** with enough context to trace the failure (Absolute Rule: boundaries must log, never silently swallow).

### 5.5 Copy (tokens of language — locked terminology honored, no raw enums)
- Tab `Reports`. Builder title `Build a report`. Controls `Break down by` · `Measure` · `Filter`.
- Measures `Members` · `Share of members`.
- Save `Save report` · busy `Saving…` · toast `"{name}" saved`.
- Saved list `Saved reports`, row = name + question + `Last run {relative}`.
- Sponsor toggle `Sponsor-safe view`, helper `Firmographic fields only. Psychographics and notes are never shown.`
- Drill-down `View these members` (→ Members slice). **Member / Guest / Comp Access** language only; never "RSVP" in UI; map every enum (e.g. `MemberStatus.GUEST` → "Guest") to a display string.

### 5.6 Chart mapping (reuse `MetricViz`, no new chart library)
`number | sparkline | line | bar | horizontal-bar | donut | heatmap | table | funnel` — existing union + `charts.tsx`. Default chart auto-picked from `FieldDefinition.type` (OPEN-CHT-2) with a manual override. No histogram viz in v1 (number fields fall back to bucketed bar).

### 5.7 AI assist (optional, not required for v1)
If a natural-language "ask a question" entry is wired into Reports, it reuses the existing `composeInsight` (`lib/intelligence/composer.ts`) — **`claude-sonnet-4-20250514`** (locked), Claude may only select from the registered catalog (validated against the registry, cannot invent a metric). No new model, no AI required for the v1 builder.

---

## 6. Open questions / decisions for Adam (do not infer)

| ID | Decision | Lens recommendation |
|----|----------|---------------------|
| **OPEN-RPT-1** | Persist custom-field reports via (A) synthetic metric ids in `metricIds` vs (B) new `reportSpec Json` column (D3) | **(A) for v1 — zero schema change.** Reserve (B) for multi-dimension/saved-chart-type. |
| **OPEN-RPT-2** | Saved-report semantics: re-run live vs snapshot the numbers | **Re-run live** for the dashboard; sponsor deliverables snapshot separately in the existing `/sponsor` pipeline (`RecapSnapshot`). |
| **OPEN-RPT-3** | Saved reports workspace-shared vs per-author private | **Workspace-shared** (zero-change default; `SavedReport` has `createdById` but no privacy flag). |
| **OPEN-QRY-1** | Aggregation engine: (A) SQL `GROUP BY` on `jsonb` (allow-listed key) vs (B) load-and-reduce in code | **(A)** for set-based scale; **(B)** acceptable v1 shortcut at NBC scale. |
| **OPEN-FW-1** | Add the new sponsor-scope reader module to `tests/unit/sponsor-firewall.test.ts` `SPONSOR_FACING` array | **Required** if it assembles any sponsor-facing output. Hand-off: a test edit the implementing engineer must make. |
| **OPEN-FW-2** | Is the dashboard sponsor-safe view a real exportable deliverable or an operator preview? | **Preview-only** in the dashboard; real deliverables stay in `/sponsor`. |
| **OPEN-CHT-1** | Custom-field time-series date axis (`syncedAt` vs `createdAt` vs none) | **None in v1** (R8 deferred). |
| **OPEN-CHT-2** | Auto default chart per `FieldDefinition.type` + whether to add a histogram viz | **Auto-default with manual override; no histogram in v1.** |
| **OPEN-SCHEMA-1** | D4 GIN index — express in `schema.prisma` (`@@index(type: Gin)`) or keep out-of-band like `Asset_searchVector_idx`? | Defer until first SaaS-scale tenant; **out-of-band + recorded migration** matches current convention. |
| **OPEN-DATA-1** | The `mergedIntoId: null` dedup fix at `metrics.ts:254` (`computeWorkspaceAudience`) — fold into this work or leave for the data-audit remediation window? | **Must be present** before any sponsor report reuses that path; recommend the data-audit window owns the fix and this contract depends on it. |

---

## 7. Locked constraints honored (audit checklist)
- **Firewall is the gate** — sponsor path reads the view, filters to `sponsorVisible`, restricts provenance, types as `SponsorAudienceMember`, suppresses sub-`MIN_CELL` cells; `sponsor-firewall.test.ts` stays the gate and is extended (OPEN-FW-1) to cover any new sponsor-facing reader. No psychographic or operator-authored data ever enters a sponsor report.
- **Tokens only, no hex** — all charts/tiles/controls use existing semantic tokens + `charts.tsx`.
- **Locked terminology** — Member / Guest / Comp Access / Event Access (never "RSVP" in UI); "Registration fields" = the application-form name; no raw enum values surfaced.
- **AI model** — any report-narration uses `claude-sonnet-4-20250514` (no new model; reuses `composer.ts`). No AI required for v1.
- **Additive schema only, never `prisma db push`** — recommended v1 is zero net-new schema; any optional column/index follows the additive `db execute` path, is recorded as a tracked migration, and never touches `Asset_searchVector_idx`.
- **Workspace scoping** — every query references `workspaceId`; the registry refuses any metric that doesn't.
- **No migrations written here** — D1–D5 are a spec handed to flux; this contract edits nothing under `prisma/`.

## 8. Out of scope
- Defining `FieldDefinition`s / editing fields (Slice 2 F5 + Settings → member-fields; this surface only **reports** and deep-links to setup).
- The existing internal psychographic/taste tiles (unchanged; operator-only region).
- The `/sponsor` brief/recap deliverable pipeline (unchanged; the dashboard sponsor-safe view is a preview of it, not a replacement).
- Any migration execution (the additive paths are specified, not run — flux owns them).
- Relationships / Lists / Act reporting (tables don't exist yet; when they do they are operator-internal and never enter the sponsor projection).
