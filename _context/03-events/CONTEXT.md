# Stage 03 — Events

> Event creation, member-facing event calendar + detail pages, registration fields builder, capacity, plus-ones toggle. Access (RSVP) submission itself lives in stage 04.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #6, #13, #14 (capacity portion), #15, #23 (hero images) |
| **Last updated** | 2026-05-26 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | **2026-05-26: Split template overhaul + hero-upload discoverability fix.** Rebuilt `TemplateSplit` to a true 50/50 (full-height `object-cover` hero left, content right) with a tightened hierarchy — category tag → serif title → `date · time · venue` (location wired in) → hairline → distinct "Limited to X spots" capacity callout → full-width CTA ticket card → short (3-sentence) teaser → borderless "How to attend" steps → full description. Mobile: ~40vh full-bleed hero, left-aligned, **sticky bottom CTA** (`RsvpCard` gained `mobileSticky` + `hideHeader` props; the sticky bar shares the same access flow). "How to attend" gained a `variant='bare'` (no box). Seeded demo events switched to `template: 'split'` (and live rows synced via `scripts/set-demo-event-template.ts`) so the redesign is what renders; **Editorial/Minimal untouched**. CTA copy stays canonical (`formatGateCTA` — never literal "RSVP"). Bug fix: `HeroImageUpload` now shows an **always-visible "Replace photo" pencil** affordance (the replace/remove flow existed but was hover-only and easy to miss) and the `#1C1008` scrim hex was replaced with a `color-mix(var(--apply-ink))` token. Not yet visually verified in-browser (member pages are Clerk-gated). — Earlier: Polish + iterate based on operator feedback. Overview tab now shows a Post-Event Summary card (attendance, check-in rate, captured revenue, no-shows) once an event has passed — via `_stats.checkedInCount` + `_stats.capturedRevenueCents`. (2026-05-24, PR #3: member event-detail pages redesigned to the editorial-luxury brand across all three layout templates — **Split** (45/55, mobile hero, mark fallback), **Editorial** (Cormorant, dramatic hero), **Minimal** — on cream paper tokens with a reveal animation and warm access copy; the "How to Attend" card was elevated and relocated into the templates. 2026-05-23: operator event settings now supports **hero image upload** (drag/drop or click → `/api/media/upload`) alongside URL paste, via the shared `HeroImageUpload`; and **ticket tiers were moved up beside the access gates** in `EventSettingsTab`.) |

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
app/operator/events/[id]/edit/page.tsx          ← operator edit UI
app/operator/events/[id]/_components/EventSettingsTab.tsx ← hero upload (URL + file) + ticket tiers beside access gates
app/operator/events/_components/HeroImageUpload.tsx ← shared hero upload (new-event flow + settings); always-visible "Replace photo" affordance + hover overlay
scripts/set-demo-event-template.ts              ← one-off: point seeded demo events at a member-page template (default split; reversible)
app/api/events/route.ts                         ← list/create
app/api/events/[id]/route.ts                    ← read/update/delete
app/api/events/[id]/publish/route.ts            ← publish (fires Phase J)
app/api/media/event-hero/[assetId]/route.ts     ← event hero image read/transform
app/api/media/upload/route.ts                   ← media upload entrypoint
app/api/cron/event-reminders/route.ts           ← scheduled reminder emails
lib/events/access-mode.ts                       ← access mode resolution
config/event-questions.ts                       ← default question library
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
