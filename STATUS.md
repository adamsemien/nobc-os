# NoBC OS — Status

_Last updated: 2026-05-19_

## Active work — Items 6 + 7 (Events + RSVP)

Branch: `feat/item-6-7-events-rsvp`

### Item 6 — Member event calendar ✅

| Area | Status |
|------|--------|
| `/m/events` — upcoming events grid, access-mode badges, hero images | ✅ |
| `/m/events/[slug]` — editorial / split / minimal templates | ✅ |
| Server data layer (`getPublishedEventsWithConfirmedCounts`, `getEventBySlug`) | ✅ |
| CSS tokens (`events-canvas`, `events-fg`, etc.) | ✅ |
| `TicketTierDTO` + `tiers[]` on `EventDetailDTO` | ✅ |

### Item 7 — RSVP system ✅

| Area | Status |
|------|--------|
| `/api/rsvp` (open events, `submitMemberRsvp`, red-list, waitlist, email) | ✅ |
| `/api/m/events/[slug]/access/payment-intent` — Stripe PI `capture_method:'manual'` | ✅ |
| `/api/m/events/[slug]/access/submit` — free + approval RSVPs | ✅ |
| `tierId` accepted in all three paths, validated, stored on RSVP row | ✅ |
| Tier selector screen in `EventAccessFlow` for ticketed events with tiers | ✅ |
| Tier price overrides event base price on payment-intent | ✅ |
| Membership gate: authenticated non-members blocked (`membership_required`) | ✅ |
| `approval_required` → `ticketStatus:'pending_approval'` | ✅ |
| Capacity overflow → `WaitlistEntry` with position | ✅ |
| `AuditEvent` on every RSVP creation | ✅ |

`tsc --noEmit` clean. `next build` clean.

## Previously completed — Easter Eggs

Branch: `feat/easter-eggs`

| Theme | Trigger | Status |
|-------|---------|--------|
| Y2K — beta 0.99 | Cmd+K → `y2k` | ✅ |
| AIM — You've Got Mail | Cmd+K → `aim` | ✅ |
| MySpace — Top 8 | Cmd+K → `myspace` | ✅ |

### AIM theme

`[data-theme="aim"]` — AOL Instant Messenger circa 2001–2003.

- Windows 98 grey background (`#D4D0C8`), raised/inset bevel on all panels and buttons
- Title bars: deep blue → sky blue gradient (`#0A246A → #A6CAF0`) with white text
- Accent: AOL gold (`#FFB900`)
- Font: Tahoma / system-ui
- Beveled buttons with Win98 border-color inset trick; active press shifts 1px
- Running man ASCII art (bottom-right corner widget)
- Away message banner (fixed top, dismissable): "Adam is away: building NoBC OS brb"
- Sound toggle button (decorative 🔊/🔇)
- Green online dot on `.member-approved` / `[data-member-status="approved"]` elements
- Door creak on activate — synthesized via Web Audio API, no file imports; three oscillators (rumble sawtooth + sine squeak + modulator)
- Toggle off: type `aim` again or switch to another theme

### MySpace theme

`[data-theme="myspace"]` — MySpace circa 2005–2008.

- Deep black/purple background (`#0D0010`) with CSS-only repeating-conic diamond pattern
- Hot pink (`#FF69B4`) + electric blue (`#00BFFF`) accents; Comic Sans everywhere
- Glitter heading effect: `ms-glitter` keyframe cycles h1/h2 through pink → blue → gold → orange
- Profile box cards: pink border + inner glow box-shadow
- Buttons: MySpace red (`#CC0033`) with pink border glow
- Top 8: first 8 rows in any member list get a faint 👑 via CSS `:nth-child(-n+8)` pseudo-element
- "Currently listening to:" banner (fixed top, dismissable): Fall Out Boy — Sugar We're Goin Down
- Blinkies row (fixed bottom): 6 animated badges in rotating colors with staggered `animation-delay`
- Profile view counter: `1,337+` (random offset seeded on theme activation)
- Toggle off: type `myspace` again or switch to another theme

Both themes: `tsc --noEmit` clean, `next build` clean.

## Previously completed — Ticketing V2

Branch: `feat/ticketing-v2-ui` (merged to main)

| Area | Status |
|------|--------|
| Schema — ticketing/series/tags models | ✅ migrated (`20260518130000_ticketing_v2_with_tags`) |
| TicketTier CRUD API (`/api/operator/ticket-tiers`) | ✅ |
| EventSeries CRUD API (`/api/operator/series`) | ✅ |
| MCP tools — `ticketing.*` / `series.*` / `tag.*` | ✅ |
| **Phase 3 — Tier manager UI in event builder** | ✅ |
| **Phase 4 — Series tab on events page** | ✅ |

## Previously completed — V1 Item 4 audit fixes

Branch: `feat/item-4-fixes` (merged to main)

- Reject route: 409 guard prevents rejecting already-APPROVED apps (blocks orphaned Member row)
- Bulk action: per-item failures surfaced; only succeeded rows removed from queue

## Database

Single Neon Postgres. Migration `20260518130000_ticketing_v2_with_tags` applied
via `prisma migrate deploy` (no reset — pre-existing RSVP-column drift remains a
harmless migration-history gap). All 12 ticketing/series/tag tables are live.
