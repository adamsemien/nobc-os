# NoBC OS — Status

_Last updated: 2026-05-19_

## Active work — Ticketing V2

Branch: `feat/ticketing-v2-ui`

| Area | Status |
|------|--------|
| Schema — ticketing/series/tags models | ✅ migrated (`20260518130000_ticketing_v2_with_tags`) |
| TicketTier CRUD API (`/api/operator/ticket-tiers`) | ✅ |
| EventSeries CRUD API (`/api/operator/series`) | ✅ |
| MCP tools — `ticketing.*` / `series.*` / `tag.*` | ✅ |
| **Phase 3 — Tier manager UI in event builder** | ✅ |
| **Phase 4 — Series tab on events page** | ✅ |

### Phase 3 — Tier manager UI

`TierManager` is mounted in the event Settings tab (`/operator/events/[id]`, Settings),
below the event form. It lists, creates, inline-edits, drag-reorders, and
soft-closes ticket tiers for the event.

- Wired to `/api/operator/ticket-tiers` (GET/POST + `/[id]` PATCH/DELETE + `/reorder`).
- Pricing uses both `memberPriceCents` and `nonMemberPriceCents` (entered as dollars).
- Delete is a **soft close** — `manuallyClosed=true`, never a hard delete; an
  `AuditEvent` (`ticket_tier.closed`) is written. (`TicketTier` has no `active`
  column; `manuallyClosed` is the soft-disable flag.)
- Drag-reorder via `@dnd-kit/sortable`, optimistic updates with revert-on-error.

### Phase 4 — Series tab

`/operator/events` now has **Events** and **Series** tabs (`EventsPageTabs`) —
Series is a tab beside the event list, not a separate route.

- `SeriesPanel` lists EventSeries with the RRULE shown as human-readable text
  (`rrule.toText()`), an instance count, and an active toggle.
- Create-series form: name, description, RRULE (with a live human-readable
  preview as you type), first occurrence, max instances.
- Expanding a series lazy-loads and lists its generated Event instances
  (title, scheduled date, status); a Generate action expands the RRULE.
- Wired to `/api/operator/series` (GET/POST/PATCH, `/[id]` GET added for the
  instance list, `/[id]/generate` POST).

Both UI phases complete on `feat/ticketing-v2-ui`. `tsc --noEmit` and
`next build` both clean.

## Database

Single Neon Postgres. Migration `20260518130000_ticketing_v2_with_tags` applied
via `prisma migrate deploy` (no reset — pre-existing RSVP-column drift remains a
harmless migration-history gap). All 12 ticketing/series/tag tables are live.
