# Nav Simplification — Spec (DRAFT, awaiting approval)

> **Status:** Proposal only. No routes / files / nav edits until Adam approves. Stage 07 owns this.
> **Date:** 2026-05-28
> **Source of truth (current nav):** `app/operator/operator-nav.tsx`

## Goal

Reduce sidebar from **12 primary items** to **8**. Promote the dashboard. Push admin chrome into Settings. Make Intelligence one entry with tabs. Make Activity ambient (on the dashboard) rather than a top-level destination. Pull the two external links out of the sidebar into a small utility strip.

## Before → After (counts)

| | Before | After |
|---|---|---|
| Primary sidebar items | 12 | **8** |
| Footer item (Settings) | 1 | 1 |
| External links in sidebar | 2 | **0** (moved to utility strip) |

## Sidebar — proposed final order

1. Dashboard
2. Applications  *(pending-count badge unchanged)*
3. Events
4. Media
5. Check-in
6. House Phone
7. Members
8. **Intelligence**  *(now a tabbed page — see §1)*

Footer: Settings *(unchanged)*

Removed from sidebar: **Sponsors**, **Team**, **Lists**, **Activity**, **Preview Site**, **Apply Form**.
**No routes are deleted in this spec.** All targets continue to exist; only their *discovery surface* changes.

---

## §1 — Intelligence + Sponsors → one nav entry with tabs

**Current:** two sidebar items — `Intelligence` (`/operator/intelligence`) and `Sponsors` (`/operator/intelligence/sponsor`, ADMIN-only).

**Proposed:**
- One sidebar entry: **Intelligence** → `/operator/intelligence`.
- Inside the page, a tab strip:
  - **Overview**  → existing `/operator/intelligence` content
  - **Sponsors**  → existing `/operator/intelligence/sponsor` content (tab hidden for non-ADMIN, mirroring today's `adminOnly` behavior)
- Active-tab highlighting via the same `--primary` ink/red treatment used elsewhere in operator UI.
- House Phone analytics already live inside Intelligence (per Stage 12 / Stage 14) — leave them on the Overview tab; do **not** add a separate House Phone tab here (House Phone has its own sidebar entry).

**Route behavior (no changes in this spec):**
- `/operator/intelligence` stays the Overview.
- `/operator/intelligence/sponsor` stays the Sponsors page (still `requireRolePage(ADMIN)`).
- Tabs are a UI-only shell. Deep links still land directly on the right tab.

**Open question (Q1):** Are there future Intelligence surfaces (e.g. Members, Events, Revenue) that should also be tabs now to lock the IA, or keep to just Overview / Sponsors today?

---

## §2 — Team + Lists → Settings

**Current:** `Team` (`/operator/team`, ADMIN-gated page) and `Lists` (`/operator/settings/lists`) are both top-level sidebar entries.

**Proposed:**
- Remove both from the sidebar.
- Surface them inside `/operator/settings` as sections, alongside the existing Settings sub-pages (Appearance, Developer, etc.).
- Lists already lives under `/operator/settings/lists` — only the sidebar removal is needed.
- Team currently lives at `/operator/team`. Options:
  - **(2a, recommended)** Keep `/operator/team` as-is and link to it from a `/operator/settings` section. Zero route change.
  - **(2b)** Move to `/operator/settings/team` and 301 the old path. More work, real route change — out of scope for this spec.
- The Settings landing index gains entries for **Team** and **Lists** so they're discoverable from one place.

**Demotion caveat preserved:** the Clerk-org-floor rule (a Clerk org admin can't be demoted via the Team UI) is unaffected — this is pure surface change.

**Open question (Q2):** Pick 2a or 2b. Default is 2a — no route move.

---

## §3 — Activity → dashboard widget

**Current:** `Activity` sidebar entry → `/operator/audit` (full audit log viewer, read-only).

**Proposed:**
- Remove `Activity` from the sidebar.
- Add an **Activity** widget on the dashboard home (`app/operator/page.tsx`) — a recent-events feed (last N rows of `AuditEvent` for the workspace) with a "View full log →" link to `/operator/audit`.
- `/operator/audit` route is preserved (no deletion) — it's just no longer in the rail.

**Placement on the editorial dashboard (open question Q3):**
- **(3a, recommended)** Add as a new editorial section under "Recent activity" in the lower asymmetric grid. The dashboard already has a Recent activity column (per Stage 07 CONTEXT.md §"Dashboard home — liquid editorial"), so the simplest path is to **bind the existing column to live AuditEvent rows** (today it likely renders mock/dev data — to confirm during implementation) and add a `SectionHeader` "View full log →" action.
- **(3b)** Add a fourth `StatFigure` slot. Crowds the figures grid; not preferred.
- **(3c)** New full-width band below Tonight. More space; breaks the asymmetric grid contract.

**Row count default:** 10 most recent events. Configurable later if needed.

**Read-only stays read-only.** Per Stage 07 rule §6 (Audit log is read-only). Widget shows the same data, no edit/delete affordances.

---

## §4 — Preview Site + Apply Form → utility strip

**Current:** two `EXTERNAL_LINKS` rendered inside the sidebar between the primary list and the Settings footer:
- `Preview Site` → `/m/events`
- `Apply Form` → `/apply`

**Proposed:**
- Remove from the sidebar entirely (drop the `EXTERNAL_LINKS` block + its divider).
- Surface in a small **utility strip** in the operator shell (`app/operator/layout.tsx`).

**Placement (open question Q4):**
- **(4a, recommended)** A thin top-right strip in the operator header area (above the page content, right-aligned), holding both links + the `UserButton`. Reuses chrome that already exists in the shell. Visual weight: light, `text-muted`, `ExternalLink` icons.
- **(4b)** A footer strip pinned to the bottom of the main column. Lower discoverability.
- **(4c)** Inside the Dashboard masthead only. Hides them everywhere else.

**Links open in a new tab** (current behavior — `target="_blank" rel="noopener noreferrer"`). Preserve.

**Open question (Q5):** Should we add a third utility-strip item — `Producer ↗` (operator-side ops jump-off)? Out of scope of the literal directive but a natural fit for this strip. Default: no, ship the two.

---

## Out of scope (called out so they don't sneak in)

- No changes to `lib/operator-role.ts`, RBAC, or any gating logic. Sponsors tab hides for non-ADMIN exactly as today.
- No changes to `/api/operator/*` or any other route handlers.
- No changes to `middleware.ts`.
- No schema changes (zero Prisma edits — keeps the absolute `prisma db push` rule untouched).
- No theme/token changes. Tabs/widget reuse `.op-glass`, `.op-btn`, `SectionHeader`, `--primary`, `--text-*`.
- No copy changes to legal/`/apply` waiver. (Locked.)
- No router or Clerk changes.

## Pre-existing finding (flagged, NOT fixed in this spec)

`operator-nav.tsx:146` renders `<span className="md:hidden">NBC</span>` for the compact sidebar wordmark. Root CLAUDE.md says **never "NBC"**. This pre-dates the nav refactor and is out of scope for this directive — flagging only. Adam to decide whether to roll the fix into this work or split.

## Open questions (consolidated)

| # | Question | Default if no answer |
|---|---|---|
| Q1 | Intelligence tabs — Overview + Sponsors only, or also pre-stub future tabs? | Overview + Sponsors only |
| Q2 | Team — keep `/operator/team` (2a) or move under `/operator/settings/team` (2b)? | 2a (no route move) |
| Q3 | Activity widget placement — bind existing Recent activity column (3a), new StatFigure (3b), or full-width band (3c)? | 3a |
| Q4 | Utility strip location — top-right (4a), bottom (4b), masthead-only (4c)? | 4a |
| Q5 | Add a third utility-strip link (Producer)? | No |
| Q6 | Is the "NBC" wordmark fix in or out of scope here? | Out (split) |

## Implementation outline (only triggered after approval)

> Documenting the seams so the approved work is a clean diff — not a license to start.

1. `app/operator/operator-nav.tsx` — trim `PRIMARY_ITEMS` to 8 (Dashboard, Applications, Events, Media, Check-in, House Phone, Members, Intelligence). Remove `EXTERNAL_LINKS` block + divider. Keep `FOOTER_ITEM` (Settings) and `UserButton`.
2. `app/operator/intelligence/_components/IntelligenceTabs.tsx` *(new)* — tab shell rendered by `/operator/intelligence` and `/operator/intelligence/sponsor` pages; active tab driven by `pathname`. Reuses `.op-btn` styling.
3. `app/operator/intelligence/page.tsx` and `app/operator/intelligence/sponsor/page.tsx` — wrap existing content in `<IntelligenceTabs>`. No data changes.
4. `app/operator/settings/page.tsx` — add Team + Lists tiles/links into the Settings landing index. No route move.
5. `app/operator/page.tsx` — switch the existing Recent activity column to bind to `db.auditEvent.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 10 })`; add `SectionHeader` "View full log →" action linking to `/operator/audit`.
6. `app/operator/layout.tsx` — add utility strip (top-right) holding Preview Site + Apply Form + `UserButton`. Move `UserButton` out of the sidebar footer.
7. **No** new env vars. **No** schema edits. **No** RBAC edits. **No** route deletions.

## Verification gate (per CLAUDE.md "goal-driven execution")

Before declaring the nav work done:
- `tsc` clean, no new errors.
- `next build` succeeds.
- Manual: every removed-from-rail destination still reachable in ≤2 clicks from a sensible entry (Sponsors via Intelligence tab; Team + Lists via Settings; Activity via dashboard widget → /operator/audit; Preview/Apply via utility strip).
- Sidebar renders all 8 items at `w-[240px]` and the icon-only compact view at `w-[68px]` without overflow.
- Applications pending badge still works (live + SSR fallback path unchanged).
- Stage 07 CONTEXT.md updated per the mandatory closing checklist (date, state, next, files in play).

## Request

Adam — review §§1–4 + the six open questions. Say **"approved as drafted"** to accept the defaults, or note which questions / sections to change. No code touches until then.
