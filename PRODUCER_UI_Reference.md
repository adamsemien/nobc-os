# PRODUCER_UI_Reference

PRODUCER_Build_Reference UI/UX pattern reference for Producer (cultural-event production app), to align a sibling codebase (NoBC OS) with the operator-dashboard conventions in use. Everything here is drawn from the actual source in artifacts/producer/; component names, class strings, and file paths are quoted verbatim -- adapt naming as needed but keep the structure.

## 1. Navigation

### Desktop sidebar

File: components/layout/sidebar.tsx (items) components/layout/sidebar-nav.tsx (active-state styling)

Nav items, in order:

- Dashboard -- /
- Calendar -- /calendar
- Events -- /events
- Tasks -- /tasks
- Directory -- /directory
- Vendors -- /vendors
- Settings -- /settings (pinned to sidebar footer)

Active-row styling (sidebar-nav.tsx:53):

```
isActive ? "bg-accent/[0.08] text-accent font-medium" : "text-text-secondary hover:bg-stone-200/60 hover:text-text-primary"
```

So: active is a tinted accent surface + accent text + medium weight; hover is a warm-stone tint + primary text. There is no left rail / border indicator -- color and weight do the work.

### Mobile bottom nav

File: components/layout/bottom-nav.tsx

Five slots, fixed bottom:

- Home -- /
- Events -- /events
- Vendors -- /vendors
- Calendar -- /calendar
- More -- opens a sheet

"More" sheet contents (secondary nav + actions): Settings, AI Agent, Directory, Export Vendors CSV, Sign out.

Pattern: keep the bottom bar to the four most-trafficked operator destinations; spill everything else into the sheet.

### Top bar

File: components/layout/topbar.tsx

Three things only:

- Brand wordmark -- "Producer" in serif italic
- "New Event" primary button -- md: and up only
- UserButton from Clerk -- right-aligned account menu

No global search, no notification bell. Operator workflows surface actions inside their own pages instead.

## 2. Page header pattern

There is no shared `<PageHeader>` component in Producer. Each route inlines the same three-piece pattern.

Example from app/events/page.tsx:52:

```jsx
<div className="mb-2">
  <h1 className="font-serif text-4xl font-light text-text-primary tracking-tight">
    Events
  </h1>
  <p className="text-sm text-text-secondary mt-1">
    All events, past and upcoming
  </p>
</div>
<hr className="border-border mb-4" />
```

Convention:

- Title: `font-serif text-4xl font-light` + `tracking-tight` -- editorial, not heavy.
- Subtitle: `text-sm text-text-secondary mt-1` -- single line, sentence case, no period.
- Separator: a real `<hr className="border-border mb-4" />` -- not a border on the next element.

This is the spec for "operator page top."

Page-level CTA placement: to the right of the title block in a flex row (e.g. "Add Vendor" in vendors-tab.tsx), or in the top bar for app-wide actions like "New Event."

Recommendation for NoBC OS: bake this into a `<PageHeader title subtitle action>` component on day one -- every Producer page does it inline and the repetition adds up.

## 3. Table / list pattern

### `<DataTable*>` primitives

File: components/shared/data-table.tsx

Exports: DataTableShell, DataTableHead, DataTableHeader, DataTableBody, DataTableRow, DataTableCell, DataTableAddRow.

Layer 1 spec, encoded in the components:

- Shell: full content width, `bg-white border border-border rounded-md overflow-hidden`. No outer shadow.
- Header row: `border-b border-border`; headers are `text-[10px] uppercase tracking-[0.12em] text-text-tertiary font-semibold whitespace-nowrap`, height `h-9`.
- Body rows: hairline `border-b border-border last:border-b-0`, height `h-11` (44px), with `hover:bg-stone-100/70 transition-colors duration-[120ms]` on every row.
- Cells: `px-4 h-11 align-middle`. Right-aligned cells get `text-right tabular-nums` automatically. tone prop maps to text-primary / secondary / tertiary / success / danger (danger and success also force tabular-nums).
- Add-row affordance: DataTableAddRow is a full-width button with `border-t border-dashed border-border hover:border-solid hover:border-text-tertiary` -- dashed when idle, solid on hover.

Render the table on the white shell, never on a tinted parent -- the "Phase H" rule is that money cells must read as spreadsheet cells.

### Empty state

File: components/shared/empty-state.tsx

```jsx
<EmptyState
  icon={Building2}
  title="No vendors on this event yet"
  subtitle="Caterers, AV, security, florals -- anyone you're paying gets tracked here."
  action={<button …>Add the first vendor</button>}
/>
```

API:

- `icon?: LucideIcon` -- defaults to Inbox
- `title: string` -- required, single sentence, no period
- `subtitle?: string` -- optional, one descriptive sentence with personality
- `action?: ReactNode` -- usually the same CTA that lives in the header
- `compact?: boolean` -- switches to a `py-6 text-center` mini version with no border

Default container: `"py-12 px-6 text-center border border-dashed border-border rounded-lg bg-background/50"`

Real usage example (post-Phase H polish): components/events/tabs/vendors-tab.tsx and components/events/tabs/staff-tab.tsx both render this shape when their collection is empty.

Note on legacy tables: A handful of older surfaces (e.g. parts of vendors-tab.tsx) still use a hand-rolled `<table>` with local Th / ContactCell helpers. New tables should use the shared primitives -- the legacy ones are mid-migration.

## 4. Status badges

### `<StatusBadge>`

File: components/shared/status-badge.tsx

One shared chip for everything. Shape is locked:

```
"inline-flex items-center text-[10px] uppercase tracking-[0.06em] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap"
```

Seven tones, all token-driven (theme swap repaints every chip):

| Tone | Surface | Text | Border |
|------|---------|------|--------|
| neutral | bg-neutral-soft | text-text-secondary | border-border |
| blue | bg-primary-soft | text-primary | border-primary/20 |
| indigo | bg-primary-soft | text-primary | border-primary/40 |
| success | bg-success-soft | text-success | border-success/30 |
| danger | bg-danger-soft | text-danger | border-danger/30 |
| warning | bg-warning-soft | text-warning | border-warning/30 |
| muted | bg-neutral-soft | text-text-tertiary + line-through | border-border |

blue vs indigo resolve to the same primary tint and differ only in border weight -- historical SOW Sent vs Received progression.

### Domain → tone maps

Same file exports canonical mappings + helpers:

```js
const SOW_TONE = {
  DRAFT: "neutral",
  SENT: "blue",
  RECEIVED: "indigo",
  SIGNED: "indigo",
  ACTIVE: "indigo",
  COMPLETE: "success",
  CANCELLED: "muted",
};
const PAYMENT_TONE = {
  PENDING: "neutral",
  PAID: "success",
  OVERDUE: "danger",
  CANCELLED: "muted",
};
export function sowTone(status): Tone { … }
export function paymentTone(status): Tone { … }
```

Always look up tone via these helpers -- never hardcode a color per call site, otherwise statuses drift across tabs.

### Other chips (intentional exceptions)

- CategoryBadge -- components/tasks/global-tasks-view.tsx:224. Neutral gray chip for task categories (not statuses).
- InsuranceBadgeInline -- components/events/tabs/vendors-tab.tsx:137. Same typographic shape as StatusBadge but a separate INSURANCE_TONE map (verified/expiring/missing/na). This is a known-consolidation target; mirror StatusBadge structure if you fork it.

## 5. Buttons

There is no shared `<Button>` component. Producer uses utility classes defined in app/globals.css:

Primary (.btn-primary, globals.css:252)

```
@apply inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary-hover active:scale-[0.98];
```

Icon-only destructive (.btn-icon-danger, globals.css:279)

```
@apply … text-text-tertiary hover:text-accent hover:bg-accent-soft;
```

Tertiary action shows up only on hover -- the row stays calm at rest and the delete affordance only resolves under pointer focus.

Inline page CTA (frequent ad-hoc pattern)

Seen in vendors-tab.tsx, staff-tab.tsx, event detail headers:

```jsx
<button
  onClick={…}
  className="flex items-center gap-1.5 bg-text-primary text-white px-4 py-1.5 text-sm font-medium rounded-[2px] hover:bg-black transition-colors"
>
  <Plus size={14} />
  Add Vendor
</button>
```

Square `rounded-[2px]` corners and text-primary → black hover, NOT bg-primary. This is the "editorial press button" -- reserved for the single primary action on a page header. Don't use it for row-level controls.

CTA placement

- App-wide action (e.g. "New Event") -- in the top bar, right side.
- Page-level action -- same row as the page title, right-aligned.
- Row-level action -- at the right edge of the row, often hover-revealed (.btn-icon-danger pattern).
- Inline add -- DataTableAddRow dashed footer at the bottom of a table, for "add another budget line / payment / staff member" loops.

## 6. Forms + modals

### `<DetailDrawer>`

File: components/shared/detail-drawer.tsx

The single way to render edit forms and detail views in Producer.

- Desktop: 420px right-rail, page stays in place behind it.
- Mobile: full-screen sheet with a backdrop scrim.
- Open animation: 220ms cubic-bezier(0.2, 0, 0, 1). Close animation: 180ms ease-in.
- A11y: Esc key closes (line 144), focus trap (line 150), backdrop scrim on mobile (line 229).
- URL sync: paired with useDrawerUrlSync (lib/use-drawer-url-sync.ts) so drawer state lives in the query string -- deep-linkable.

Form layout inside the drawer

Field labels are uppercase micro-caps; inputs are full-width with a subtle focus ring. Both come from app/globals.css:

```css
.field-label { @apply block text-[11px] uppercase tracking-[0.08em] font-medium text-text-secondary mb-1.5; }
input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent); }
```

Vertical rhythm in forms: `space-y-4` between fields. Required-field asterisks live in the label, not floating next to the input.

Modals vs drawers

Producer prefers drawers. Modals are reserved for destructive confirmations and one-off short prompts (the "Reset Demo Data" confirm in components/demo/demo-section.tsx is the canonical example). If you're showing more than ~3 form fields, use a drawer.

## 7. Loading + error states

### Loading

- Pages: every async route has a sibling loading.tsx that renders a `<SectionSkeleton lines={…} />` -- shaped placeholder, never a spinner.
- Streaming sections: app/settings/page.tsx wraps each section in `<Suspense fallback={<SectionSkeleton lines={…} />}>` so the page streams in chunks.
- Inline mutations: Loader2 from lucide-react with a spin class is used inside buttons during pending server actions (useTransition pattern).

Whole-page spinners are absent on purpose. Rule: skeletons for layout, spinners only for in-button progress.

### Errors

- Toast layer: lib/toast.ts + components/shared/toast-host.tsx (custom, no library). Used for action feedback ("Saved", "Couldn't delete").
- Inline form errors: rendered directly under the offending field in `text-xs text-accent`. There is no global error banner pattern.
- Crash safety: server actions and webhook side-effects are fire-and-forget (void fireWebhook(…)); inner rejections are caught and logged so a single failed automation never tanks the page.

## 8. Design tokens

All color / type / radius is centralized. Files:

- tailwind.config.ts -- exposes tokens to Tailwind utilities (bg-primary, text-text-secondary, etc.)
- app/globals.css -- the actual `:root { --primary: …; }` values
- lib/theme.ts -- preset theme definitions (the one place hex literals are allowed)

### Color tokens

| Token | Value | Used for |
|-------|-------|----------|
| --bg | #FAFAF9 | page background (warm off-white) |
| --surface | #FFFFFF | cards, tables, drawer |
| --accent | #DC2626 | destructive, over-budget, active nav |
| --primary | #4F46E5 | links, primary buttons, focus ring |
| --success | #059669 | revenue, paid, positive variance |
| --warning | -- | partial/expiring status |
| --danger | -- | duplicate of accent for status badges |
| --text-primary | -- | body text |
| --text-secondary / --text-tertiary | -- | descending hierarchy |
| --border | -- | hairline rules |
| --*-soft | -- | derived 8--12% tints for badge surfaces |

Every tone token has a paired `--*-soft` surface so badges, tags, and alert tints repaint correctly when the theme changes.

### Typography

- --font-serif: "Cormorant Garamond" -- used for headlines and big numerals (font-serif font-light is the editorial default)
- --font-sans: "Inter" -- body text and UI chrome
- tabular-nums is mandatory on any element that renders money or counts -- DataTableCell adds it automatically on right-aligned cells

### Radius

- --radius-base: 8px (general)
- rounded-md (6px) for inputs and buttons
- rounded-[2px] for "press button" CTAs (editorial square edge)
- rounded-full for StatusBadge chips

### Hex literal policy

Codebase invariant (enforced socially, not via lint): components must not contain hex literals. Colors come through Tailwind tokens which resolve to var(--*). Hex is only legal in lib/theme.ts (preset definitions) and inline style attributes that explicitly preview a theme color. Audit confirms: components are clean.

## 9. Settings page structure

File: app/settings/page.tsx

Layout is stacked sections in a single column, not a tabbed layout and not a settings sidebar.

Wrapper: `<div className="max-w-2xl space-y-8"> … </div>`

Section order: Health, Calendar Feed, Webhooks, Automations, Templates, Theme, Agent, Notifications, Storage Cleanup, Document Log (Dev-only), Demo -- only renders when NODE_ENV !== "production".

Each section is its own server component wrapped in `<Suspense>` with a SectionSkeleton fallback, so heavy sections (Webhooks, Automations) don't block the rest of the page.

Section headers reuse the page-header typography (font-serif font-light) at a smaller size -- usually text-2xl.

Recommendation for NoBC OS: keep the same stacked / suspense-streamed model. The 2xl-width column reads better than a two-pane settings layout, especially because most settings are short forms.

## 10. Mobile patterns

### Responsive tables

The convention is two parallel trees, gated by Tailwind's md breakpoint:

```jsx
{/* Mobile cards */}
<div className="md:hidden space-y-2">
  {rows.map(r => <MobileCard key={r.id} r={r} />)}
</div>
{/* Desktop table */}
<table className="hidden md:table w-full"> … </table>
```

Verified across staff-tab.tsx, tasks-tab.tsx, vendor list components. This is preferred over making one table reflow -- operator data is dense enough that a card-per-row mobile rendering reads dramatically better.

### Event detail on mobile

File: components/events/mobile-event-section.tsx

The desktop event-detail screen is a multi-tab layout (Overview, Tasks, Budget, P&L, Vendors, Staff, …). On mobile it becomes a drill-down section list:

- Top level shows a list of sections (one per desktop tab).
- Tapping a section navigates into a sub-page with:
  - Sticky sub-page header: `h-14 bg-surface border-b border-border flex items-center px-2`
  - `<ArrowLeft>` back button on the left
  - Section title in the middle
  - The tab content component (the same one the desktop uses, e.g. `<TasksTab>`, `<PnlTab>`) mounts inside the sub-page -- no separate mobile-only implementations.

Pattern: keep the same data components, swap the chrome. The desktop "five tabs all visible" layout is hostile on a phone; the drill-down preserves all functionality without compromise.

### Bottom nav + sheet

See section 1. Most non-trafficked navigation lives in the "More" sheet rather than competing for bottom-bar slots. Operators get four direct buttons and one escape hatch.

## Quick checklist for NoBC OS alignment

If you want pages that "feel like Producer," ship these primitives first:

- `<PageHeader title subtitle action />` -- codify the inline pattern
- `<DataTable*>` primitives -- copy the API verbatim, the row height / hover / tabular-nums conventions are doing real work
- `<EmptyState icon title subtitle action />` -- every list needs one
- `<StatusBadge tone />` + per-domain tone maps (sowTone, paymentTone, etc.) -- never hardcode chip colors at call sites
- `<DetailDrawer>` -- 420px desktop / full mobile, 220ms in / 180ms out, Esc + focus trap + scrim, URL-synced state
- Token-driven color (--primary, --accent, --success, --*-soft) -- no hex in components, theme preset file is the only exception
- Serif headlines + tabular-nums on every money/count cell
- loading.tsx skeletons per route + Suspense per heavy section; Loader2 only inside in-flight buttons
- Mobile: parallel cards-vs-table trees gated by md:; drill-down sub-pages instead of cramming desktop tabs onto a phone
