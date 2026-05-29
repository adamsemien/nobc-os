# Stage 03 — Events

> Event creation, member-facing event calendar + detail pages, registration fields builder, capacity, plus-ones toggle. Access (RSVP) submission itself lives in stage 04.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #6, #13, #14 (capacity portion), #15, #23 (hero images) |
| **Last updated** | 2026-05-29 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | **2026-05-29: Editorial two-column redesign.** Rebuilt `TemplateEditorial` body into a two-column layout at `lg:` (`lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-16`): description + run-of-show + "how to attend" + brand anchor in the left column, `RsvpCard` in a **sticky** right column (`lg:sticky lg:top-8`). The card spans both content rows (`lg:row-span-2`) so the sticky travels the full left-column height regardless of which optional sections render; below `lg` it collapses to the existing stacked order (description → card → detail → anchor). Enabled `mobileSticky` on the Editorial `RsvpCard` (already built for Split — no `RsvpCard.tsx` changes). **Killed the hero scrim** (removed the brown `linear-gradient(rgba(28,16,8,…))` overlay — note: hero `<h1>` is still `text-white`, watch legibility over light photos). Token fixes in `EventAccessFlow.tsx`: modal panel `bg-[#F9F7F2]`→`bg-events-paper` and QR skeleton `bg-[#F1ECE2]`→`bg-events-paper` (no-hex-literals rule). Minor: `ev-stagger` now groups 3 blocks; desktop brand anchor sits under detail instead of viewport-pinned (mobile pinning unchanged). tsc clean. Out of scope: other pre-existing `#F9F7F2`/`#F1ECE2` hexes in `MemberEventsExplorer`/`FlowPreview`/`confirmed/page`/`apply/page`. — **2026-05-29: status-display contradiction fix.** Member event-detail pages were rendering the CLOSED / "By membership" access card and a contradictory "Free entry, no application required" `WorkflowPathsCard` simultaneously when `access.member.enabled=true` + `access.guest.enabled=false` but `EventWorkflow.paths` was configured with the open template. Root cause: `event.workflowPaths` is read independently of `resolveAccessForViewer` — two data sources, no cross-check. Fix: guarded the `WorkflowPathsCard` render in all three templates (`TemplateEditorial.tsx:91`, `TemplateSplit.tsx:85`, `TemplateMinimal.tsx:74`) on `event.resolved.kind !== 'closed'` — the "How to attend" steps are meaningless when there's no path through for the current viewer. Three one-line guards, no DTO/schema changes. tsc + next build clean. Cherry-picked onto main, deployed. Followup (out of scope): operator-side warning when configured `EventWorkflow.paths` are unreachable for guest viewers given current `EventAccess.guest.enabled` — surfaces the underlying config drift instead of just hiding the symptom. — **2026-05-27, PR #25 (merged): Editorial below-fold parity with Split.** Applied the same below-fold hierarchy fixes to `TemplateEditorial` (hero overlay untouched): collapsed the 2-col grid (description left / sticky card aside) into a single column — description renders before the access card, the card is capped at `max-w-[400px]` left-aligned (was a full-width sticky aside), and the minimal footer became the same bottom brand anchor (hairline + muted serif wordmark + `venue · Austin` + contact, `mt-auto`). Kept the card's own header (access label + capacity meter) since Editorial has no separate category tag/capacity callout, and did not add the mobile sticky CTA (Split-only). — **2026-05-26: Split post-merge review polish (PR after #23).** Capped the access/ticket card at `max-w-[400px]` left-aligned (was full-width); moved the event description above the CTA card (read-before-CTA); replaced the small footer with an intentional bottom brand anchor (muted serif "No Bad Company" wordmark + `venue · Austin` + contact, `mt-auto`) so short-copy events don't trail off into dead whitespace. Redesigned `EventHeroFallback` (shared by all 3 templates) from the jarring solid-red + "By application" text to a dark warm brand-ink ground (top-light gradient + faint diagonal texture + vignette) with just the centered NoBC wordmark — no green token exists in the warm events palette, so the ground is `--apply-ink`. (Date/time/venue single-line + the red capacity callout were already shipped in #23.) — **2026-05-26: Split template overhaul + hero-upload discoverability fix.** Rebuilt `TemplateSplit` to a true 50/50 (full-height `object-cover` hero left, content right) with a tightened hierarchy — category tag → serif title → `date · time · venue` (location wired in) → hairline → distinct "Limited to X spots" capacity callout → full-width CTA ticket card → short (3-sentence) teaser → borderless "How to attend" steps → full description. Mobile: ~40vh full-bleed hero, left-aligned, **sticky bottom CTA** (`RsvpCard` gained `mobileSticky` + `hideHeader` props; the sticky bar shares the same access flow). "How to attend" gained a `variant='bare'` (no box). Seeded demo events switched to `template: 'split'` (and live rows synced via `scripts/set-demo-event-template.ts`) so the redesign is what renders; **Editorial/Minimal untouched**. CTA copy stays canonical (`formatGateCTA` — never literal "RSVP"). Bug fix: `HeroImageUpload` now shows an **always-visible "Replace photo" pencil** affordance (the replace/remove flow existed but was hover-only and easy to miss) and the `#1C1008` scrim hex was replaced with a `color-mix(var(--apply-ink))` token. Not yet visually verified in-browser (member pages are Clerk-gated). — Earlier: Polish + iterate based on operator feedback. Overview tab now shows a Post-Event Summary card (attendance, check-in rate, captured revenue, no-shows) once an event has passed — via `_stats.checkedInCount` + `_stats.capturedRevenueCents`. (2026-05-24, PR #3: member event-detail pages redesigned to the editorial-luxury brand across all three layout templates — **Split** (45/55, mobile hero, mark fallback), **Editorial** (Cormorant, dramatic hero), **Minimal** — on cream paper tokens with a reveal animation and warm access copy; the "How to Attend" card was elevated and relocated into the templates. 2026-05-23: operator event settings now supports **hero image upload** (drag/drop or click → `/api/media/upload`) alongside URL paste, via the shared `HeroImageUpload`; and **ticket tiers were moved up beside the access gates** in `EventSettingsTab`.) |

## Scope

Event lifecycle from operator creation → publishing → member-facing display. Includes:
- Branded `/m/events` calendar + `/m/events/[slug]` detail pages
- Operator event creation/edit UI
- Custom question builder per event (e.g., "What's your dietary restriction?")
- Capacity field + per-event plus-ones toggle
- Three access modes: `open | ticketed | apply_or_pay`

## Files in play

```
app/m/events/page.tsx                           ← public calendar
app/m/events/[slug]/page.tsx                    ← event detail (selects a template below)
app/m/events/[slug]/_components/EventDetail.tsx ← detail shell; picks Split/Editorial/Minimal
app/m/events/[slug]/_components/TemplateSplit.tsx     ← 45/55 layout, mobile hero, mark fallback
app/m/events/[slug]/_components/TemplateEditorial.tsx ← Cormorant display, dramatic hero
app/m/events/[slug]/_components/TemplateMinimal.tsx   ← minimal layout
app/m/events/[slug]/_components/EventHeroFallback.tsx ← branded fallback when no hero image
app/m/events/[slug]/_components/event-format.ts ← shared date/format + warm access-copy helpers
app/operator/events/page.tsx                    ← operator event list
app/operator/events/[id]/page.tsx               ← operator edit UI (no /edit sub-route; tabs render in the same page)
app/operator/events/[id]/_components/EventSettingsTab.tsx ← hero upload (URL + file) + ticket tiers beside access gates
app/operator/events/_components/HeroImageUpload.tsx ← shared hero upload (new-event flow + settings); always-visible "Replace photo" affordance + hover overlay
scripts/set-demo-event-template.ts              ← one-off: point seeded demo events at a member-page template (default split; reversible)
app/api/operator/events/route.ts                ← list/create
app/api/operator/events/[id]/route.ts           ← read/update/delete (publish flag goes through the PATCH here; there is no separate /publish endpoint)
app/api/media/event-hero/[assetId]/route.ts     ← event hero image read/transform
app/api/media/upload/route.ts                   ← event-hero image upload — uses Vercel Blob (`@vercel/blob` `put()`); candidate for future migration to R2 for consistency with Stage 15 (DAM), but out of scope today
app/api/cron/event-reminders/route.ts           ← scheduled reminder emails
app/operator/events/[id]/_components/EventApplicationsTab.tsx ← event-scoped applications tab (reuses the stage-02 review queue)
```

## Inputs

- Operator creating an event
- Member visiting `/m/events` or a slug

## Outputs

- `Event` row, `EventQuestion` rows, `TicketTier` rows (if ticketed)
- Phase J webhook fired on publish/update/cancel → stage 11

## Schema models

- **Event**: workspaceId, slug, title, description, startTime, endTime, location, capacity, accessMode, approvalRequired (→ stage 04 reads this), plusOnesAllowed, plusOnesPerRsvp, status (`draft | published | cancelled`)
- **EventQuestion**: eventId, label, type (`text | select | boolean | photo`), required, options (JSON), order
- **TicketTier**: eventId, name, price, capacity, salesStart, salesEnd
- **EventSeries**: workspaceId, name, recurrence pattern (for "Mahjong League" / "French Leave Friday")
- **EventFlowTemplate**: reusable event flow definitions (registration steps, comp paths)
- **EventWorkflow**: per-event resolved workflow instance (`apply_or_pay`, `members_only`, etc.)
- **EventCustomQuestion**: per-event question rows surfaced to members as "Registration fields"
- **GeneratedAsset**: AI-generated hero images and other event media
- **SeriesSponsor**: sponsor attachment to an EventSeries

## Rules — DO NOT VIOLATE

1. **Events are workspace-scoped.** Slug uniqueness is per-workspace, not global.
2. **Three access modes only:** `open` (anyone can RSVP), `ticketed` (paid), `apply_or_pay` (apply for free OR pay to skip approval). No fourth mode.
3. **Publishing fires Phase J.** Every publish/update/cancel must POST to Producer's `/api/webhooks/nobc-os/event-notify` with HMAC. If Producer is down, queue for retry — do not block the publish.
4. **Plus-ones is per-event, not per-member.** A member can have plus-ones at one event and not another.
5. **Custom questions are stored per-event, NOT mixed with application questions.** Do not reference `Application` schema patterns here — different model, different lifecycle.
6. **No hex literals.** Use semantic tokens.

## What this stage does NOT own

- Access (RSVP) submission, approval-required handling, waitlist auto-promotion → `04-access/`
- Stripe payment for ticketed events → `05-payments/`
- Check-in + wallet passes → `06-wallet-checkin/`
- The actual Phase J webhook send mechanics → `11-producer-integration/`
- AI-assisted event creation → `10-ai-event-builder/`
