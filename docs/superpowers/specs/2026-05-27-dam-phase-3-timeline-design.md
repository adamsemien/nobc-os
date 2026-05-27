# DAM Phase 3 — Timeline / Moment Map — Design

**Date:** 2026-05-27
**Stage:** 15 — Media (Digital Asset Manager)
**Status:** Approved (brainstorm) → ready for implementation plan
**Depends on:** Phases 1, 2a, 2b (merged & live in prod)

---

## Goal

A secondary view on `/operator/media` that plots a **single event's** photos along a **proportional, fit-to-width time axis** — so an operator can relive and navigate the arc of a night: arrivals, the quiet dinner gap, the dance-floor burst. Dense bursts collapse into counted "moment" stacks.

This is a **read/browse view**, not an editing surface.

---

## Decisions (locked in brainstorm)

| # | Decision |
|---|---|
| 1 | **One Timeline view**, proportional time-plot. (Earlier "A/B/C" options collapsed into this single model.) |
| 2 | **Fit-to-width axis** — the whole event spans the viewport; no horizontal scroll. |
| 3 | **Burst-collapse is the built-in density mechanism** (not a separate mode): overlapping thumbnails collapse into a counted stack (`×N`) that expands on click. Mandatory. |
| 4 | **Collapse rule = pixel-overlap at the static fit-to-width scale.** The threshold lives in **one isolated constant** so the v2 upgrade is localized. |
| 5 | **Continuous scrubber = a playhead** that pans to a moment in time and highlights the nearest cluster (not hour-jumping). |
| 6 | **Availability:** enabled only when the current filtered set resolves to **exactly one `eventId`**; otherwise the toggle is disabled with a hint. |
| 7 | **Time key:** `time = shootDate ?? createdAt` (the fallback already used by the assets route — Phase 1). Just made visible on the axis. |
| 8 | **Banner only when the *whole set* has no real `shootDate`** (all-undated). Mixed sets plot silently. |
| 9 | **No schema or API changes** — the assets API already returns everything needed. |
| 10 | **Scope:** browse-only (no selection/bulk in Timeline); photos only; toggle label "Timeline". |

**Deferred to v2 (documented, not built):** zoom-dependent re-clustering — the axis becomes zoomable and the collapse threshold becomes scale-responsive, so zooming into a burst spreads it apart. Its value only shows against real bursty event data, which can't be validated with seeded photos. The v2 move is a localized change to the single collapse constant + a zoom/pan layer, not a rewrite.

---

## Architecture

### `lib/dam/timeline.ts` — pure layout core (unit-tested, TDD)

Mirrors the existing pure-helper pattern (`lib/dam/bulk.ts`, `lib/dam/flip.ts`, `lib/dam/search.ts`). No React, no DOM — just data in, layout out, so it's fully unit-testable.

```ts
/** Min center-to-center px below which adjacent photos collapse into one stack.
 *  THE single isolated collapse threshold. v2: make this scale-responsive. */
export const COLLAPSE_PX = 32;

export interface TimelineAsset {
  id: string;
  shootDate: string | null;   // ISO or null
  createdAt: string;          // ISO (always present)
  eventId: string | null;
}

export interface HourMarker { t: number; x: number; label: string }      // epoch ms, px, e.g. "8 PM"
export interface TimelineSingle { kind: 'single'; id: string; t: number; x: number }
export interface TimelineStack  { kind: 'stack';  ids: string[]; count: number; t: number; x: number }
export type TimelineItem = TimelineSingle | TimelineStack;

export interface TimelineLayout {
  start: number;            // epoch ms of earliest item (0 items → 0)
  end: number;              // epoch ms of latest item
  items: TimelineItem[];    // chronological order, positioned + collapsed
  markers: HourMarker[];    // hour boundaries within [start,end]
  allUndated: boolean;      // assets.length > 0 && every shootDate == null
  eventCount: number;       // distinct non-null eventIds in the set (availability guard)
}

export interface BuildOpts { containerWidth: number; thumbPx: number; collapsePx?: number }

export function assetTime(a: Pick<TimelineAsset,'shootDate'|'createdAt'>): number; // Date.parse(shootDate ?? createdAt)
export function buildTimeline(assets: TimelineAsset[], opts: BuildOpts): TimelineLayout;
```

**Positioning.** Sort by `assetTime` asc. `span = end - start`. Usable width `W = max(0, containerWidth - thumbPx)` (so the last thumb fits). `x(t) = span > 0 ? ((t - start)/span) * W : 0`. When `span === 0` (single photo, or all identical timestamps) every item gets `x = 0` and they collapse into one stack/single — no divide-by-zero.

**Collapse (greedy, anchor-based).** Walk the sorted items left→right. Open a cluster anchored at the first item's `x`. Keep absorbing subsequent items while `x(next) - x(anchor) < collapsePx` (default `COLLAPSE_PX`). When an item exceeds the threshold, close the cluster and start a new one anchored at that item. A cluster with one member → `TimelineSingle`; >1 → `TimelineStack` (with `count`, `ids`, representative `t`/`x` = anchor's).

**Markers.** Emit one `HourMarker` at each top-of-hour boundary inside `[start, end]`, positioned via `x(t)`, labeled in the workspace's locale (e.g. `8 PM`). If the span is under an hour (no interior boundary), emit start + end labels instead so the axis is never unlabeled.

**`eventCount`** = size of the set of non-null `eventId`s. Powers the single-event guard.

### `app/operator/media/_components/TimelineView.tsx` — the view (client)

- Fetches `GET /api/media/dam/assets?<current sp>` (same query the grid uses — current folder/event/filters), exactly as `MediaGrid` does. Reuses the `MediaAsset` type.
- `ResizeObserver` for `containerWidth` (mirrors `MediaGrid`).
- Runs `buildTimeline(assets, { containerWidth, thumbPx })`.
- **Guard:** if `eventCount > 1`, render the single-event empty-state (*"Filter to a single event to see its timeline."*) instead of plotting.
- Renders: optional banner (when `allUndated`), the axis baseline + `HourMarkers`, each `TimelineItem` (single thumb or `MomentStack`), and the `Scrubber` playhead.
- Click a single → opens the existing `MediaPreview` with the timeline's chronological list as the nav set (reuse `MediaPreview` as-is). Click a stack → expands a popover grid of that moment's members; clicking a member → `MediaPreview`.

Sub-components (kept small, same folder): `HourMarkers`, `MomentStack` (the `×N` cluster + expand popover), `Scrubber` (playhead + time chip).

### `MediaToolbar.tsx` — Grid | Timeline toggle

A two-state toggle writing `?view=timeline` (consistent with the existing `?view=trash` param). Disabled (with the single-event hint as a title) when the loaded set spans >1 event.

### `MediaWorkspace.tsx` — view routing

Reads `sp.get('view')`. `'timeline'` → render `<TimelineView>` in place of the grid (`FolderTree` + `FilterPanel` still flank it). `'trash'` and unset behave as today. Timeline and Trash are mutually exclusive view states. The bulk bar / upload dropzone are grid-only.

**Availability detection.** `MediaWorkspace` already receives the grid's loaded assets via `onAssetsChange`; it computes distinct `eventId` count from that set and passes an `enabled` flag to the toolbar toggle. `TimelineView` independently re-checks `eventCount` after its own fetch (belt-and-suspenders against filter changes made while in Timeline).

---

## Data flow

```
FilterPanel / FolderTree  ──set URL params──▶  TimelineView
                                                   │  GET /api/media/dam/assets?<sp>   (no new endpoint)
                                                   ▼
                                        buildTimeline(assets, {containerWidth, thumbPx})
                                                   │
                          ┌────────────────────────┼─────────────────────────┐
                          ▼                         ▼                         ▼
                    HourMarkers              items (singles/stacks)        Scrubber
                                                   │ click
                                                   ▼
                              MediaPreview (existing) / stack popover → MediaPreview
```

**Implementation note (flag for the plan):** the Timeline needs the **full** single-event set, not a truncated page. Confirm whether `GET /api/media/dam/assets` caps results; if it paginates/limits, raise or relax the cap for the single-event Timeline query (e.g. an `all=1` param or a higher limit) so no photos are silently dropped from the axis.

---

## Edge cases

- **Empty event** → standard empty-state, no axis.
- **All-undated** (seeded data today) → plots by `createdAt`; banner shown. Goes away once real EXIF photos are uploaded.
- **Mixed dated/undated** → plots silently by `shootDate ?? createdAt`; no banner.
- **Single photo / all-identical timestamps** (`span === 0`) → one centered single/stack; no divide-by-zero.
- **One giant burst** → collapses to a single `×N` stack; expand popover handles the rest.
- **`containerWidth === 0`** (pre-measure) → defer render until the `ResizeObserver` fires (same as `MediaGrid`).
- **Set spans >1 event** → single-event empty-state, no plot.

---

## Testing

- **Vitest** (`tests/unit/dam/timeline.test.ts`) on `lib/dam/timeline.ts`:
  - `assetTime` uses `shootDate` when present, falls back to `createdAt`.
  - `buildTimeline` positioning: proportional `x`, first at 0, last at `containerWidth - thumbPx`.
  - collapse: near-adjacent items merge into a stack with correct `count`/`ids`; well-separated items stay single.
  - `span === 0` → no NaN, single item/stack.
  - `allUndated` true only when every `shootDate` is null and length > 0; false for mixed.
  - `eventCount` distinct-count (incl. nulls ignored).
  - markers: hour boundaries within span; sub-hour span → start+end labels.
- **`tsc`** clean, **`next build`** green. View components verified on the preview deploy.

---

## Design tokens

- Cream paper ground, evergreen accents (consistent with the rest of the DAM).
- **NBC red** scrubber/playhead + stack `×N` badge.
- **Mono** (`var(--font-mono)`) for timestamps / hour labels; serif (`var(--font-display)`) only if a heading is needed.
- Lucide icons. **No hex literals** — semantic tokens only.

---

## Scope / non-goals

- **No selection or bulk actions** in Timeline (those stay in the grid).
- **Photos only** (video ingest is a later phase; the set is photos).
- **No zoom/pan** in v1 (deferred v2 — see above).
- No schema changes, no new API route (reuses `GET /api/media/dam/assets`).

---

## Housekeeping (folded into this phase)

Update `_context/15-media-dam/CONTEXT.md`:
- State → Phases 1 / 2a / 2b **merged & live in prod** (#26, #27, #29); Phase 3 **in progress**.
- Next → the literal next Timeline step.
- Files in play → add `lib/dam/timeline.ts`, `TimelineView.tsx` + sub-components; note `MediaToolbar`/`MediaWorkspace` extended.
- Scope list → mark Phase 3 in progress.
