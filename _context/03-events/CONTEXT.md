# Stage 03 — Events

> Event creation, member-facing event calendar + detail pages, registration fields builder, capacity, plus-ones toggle. Access (RSVP) submission itself lives in stage 04.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #6, #13, #14 (capacity portion), #15, #23 (hero images) |
| **Last updated** | 2026-05-21 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | Polish + iterate based on operator feedback. Overview tab now shows a Post-Event Summary card (attendance, check-in rate, captured revenue, no-shows) once an event has passed — via `_stats.checkedInCount` + `_stats.capturedRevenueCents`. |

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
app/m/events/[slug]/page.tsx                    ← event detail
app/operator/events/page.tsx                    ← operator event list
app/operator/events/[id]/edit/page.tsx          ← operator edit UI
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
