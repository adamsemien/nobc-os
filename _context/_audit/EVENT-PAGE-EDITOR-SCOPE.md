# Event Page Live Editor — Build Scope

> Synthesized from three tonone scoping passes (draft = UX, prism = frontend
> architecture, form = design-system guardrails). Branch: `feat/event-page-editor`
> off `#105`. Goal: let an operator tweak an event page's look/feel **live, in the
> preview, saved per event** — because legibility shifts with every hero photo.

## The shape (all three agreed)
- **Lives in the operator preview chrome.** `EventDetail.tsx` already renders a fixed
  `ViewToggle` (Preview · Guest/Member) when `isOperator`. The editor extends that —
  operator-only, never in the member bundle.
- **Per-event overrides in an additive `Event.pageStyle Json?` column.** Null → defaults.
- **Applied via CSS custom properties** on a wrapper around the template; templates read
  the vars with fallbacks. Changes are instant (local state → inline `style` → repaint),
  no re-fetch. (The hero scrim already works this way.)
- **Defaults == current look**, so nothing regresses — critical because visual output
  can't be machine-verified; the operator is the visual verifier.
- **Brand law is enforced by the editor, not trusted to the operator** (form): NO arbitrary
  color pickers, NO font pickers. Brand red, button styling, fonts, body/paper tokens stay
  LOCKED. Only bounded, legibility-serving knobs are exposed.

## Customizable property schema (reconciled)

| Property | CSS var | Control | Default | Min/Max or enum | Applies to |
|---|---|---|---|---|---|
| Hero scrim — top | `--hero-scrim-top` | slider | 0.55 | 0.30 / 0.75 | Editorial, Split |
| Hero scrim — bottom | `--hero-scrim-bottom` | slider | 0.65 | 0.45 / 0.85 | Editorial, Split |
| Hero text mode | `--hero-text-mode` | toggle | light | light / dark | Editorial, Split |
| Title scale | `--page-title-scale` | slider | 1.0 | 0.80 / 1.20 | all 3 |
| Hero height | `--hero-height-vh` | select | 58 | compact 44 / standard 58 / tall 72 | Editorial, Split |
| Paper texture | `--paper-grain-on` + `--paper-grain-opacity` | toggle + slider | off / 0.03 | 0.01 / 0.06 | Editorial, Minimal |
| Access-card elevation | `--card-shadow-level` | select | raised | flat / raised / lifted | all 3 |
| Footer wordmark scale | `--footer-wordmark-scale` | select | md | sm / md / lg | all 3 |

**LOCKED (editor never exposes):** brand red + button styling ("all buttons NBC red"),
font families (Cormorant / DM Sans), body + paper colors (semantic tokens / white-label),
the logo mark color (always red — the scrim, not a color swap, is what makes it legible),
any hex/color/font picker. Scrim is black-opacity only.

**Legibility guardrail (form):** a CSS `max()` floor so a stored value can't make text
unreadable — `rgba(0,0,0, max(var(--hero-scrim-bottom,0.65), 0.45))` for light text, 0.55
floor for dark text. The slider min is UX; the `max()` is the real guarantee.

## Data model
`lib/page-style.ts` (new): `PageStyle` type + `PageStyleSchema` (Zod, bounds above) +
`PAGE_STYLE_DEFAULTS` (= current look) + `parsePageStyle(raw)` (safe-parse → defaults on bad input).
`Event.pageStyle Json?` additive. Migration artifact `prisma/sql/additive_event_page_style.sql`
(`ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "pageStyle" JSONB;`).

> **Prisma 7 migrate-diff flags** (corrected from the scope draft): use `--from-schema` /
> `--to-schema` (NOT `--from-schema-datamodel`). Snapshot schema before editing, then
> `migrate diff --from-schema <before> --to-schema prisma/schema.prisma --script`, review
> (only ADD COLUMN), then `db execute --file prisma/sql/additive_event_page_style.sql`.
> Never `db push`. Use `node node_modules/prisma/build/index.js`.

## Read path (files)
`lib/events.ts` `listSelect` += `pageStyle: true` (covers both loaders) · `EventDetailDTO`
+= `pageStyle: PageStyle` · `app/m/events/[slug]/page.tsx` + `lib/public-event-loader.ts`
map `parsePageStyle(event.pageStyle)` into the DTO.

## Apply + editor (files)
- `EventPageStyleWrapper.tsx` (new) — sets the CSS vars from a `PageStyle`, wraps
  `renderTemplate()` inside `EventDetail` (member subtree only, not the chrome).
- Templates read the vars: Editorial (scrim already done; + hero-height + title-scale),
  Split (+ scrim + title-scale + height), Minimal (+ title-scale + texture).
- `PageStyleEditor.tsx` (new, operator-only) — panel opened from the ViewToggle chrome;
  controls bound to local state; live-applies via the wrapper; dirty tracking; Save / Discard
  / Reset-to-default. Save = `PATCH /api/operator/events/[id]` with `pageStyle`
  (Zod-validated, `requireRole(STAFF)`, workspace-scoped). Panel shifts the page (does not
  overlay it) so the operator sees the real result.
- Texture: a `::before` SVG feTurbulence grain layer in `globals.css`, opacity =
  `--paper-grain-on * --paper-grain-opacity` (capped 0.06).

## Phasing
- **P1 Foundation** (no schema, defaults==current): scrim wired to vars (DONE in Editorial),
  `lib/page-style.ts`, DTO field, wrapper, title-scale + hero-height vars across templates,
  loaders pass `PAGE_STYLE_DEFAULTS`. Member pages visually identical.
- **P2 Schema + read**: additive column + migration artifact, `listSelect`, loaders parse real value.
- **P3 Apply hardening + persistence**: PATCH route accepts `pageStyle`; CSS `max()` floor;
  texture layer; card/footer var hooks.
- **P4 Editor UI**: `PageStyleEditor` panel, controls, live apply, Save. The operator-verified part.

## Risks
No visual verification on my side → P1/P2 keep defaults == current (zero member-facing change,
all tsc-verifiable); the editor (P4) is where the operator verifies. Operator-only render gate
means members never see the editor and the member bundle is unaffected.
