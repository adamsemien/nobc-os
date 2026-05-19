# NoBC OS — Status

_Last updated: 2026-05-19_

## Apply form — 9-screen expansion ✅

Branch: `feat/apply-form-v2`

| Area | Status |
|------|--------|
| **FormData interface** — 23 new fields, 4 retired (`busyDuringDay`, `socialLink`, `connectedPeople`, `alwaysCalledAbout`) | ✅ |
| **Screen 0 (The Basics)** — added `homeAddress`, `whatYouDo` (textarea, required), `howDidYouHear` | ✅ |
| **Screen 1 (Personality & Perspective)** — updated obsessedWith label, removed alwaysCalledAbout, added `personYouAdmire` | ✅ |
| **Screen 2 (Community Fit)** — reordered; added `howDoYouKnowGoodCompany` (required, first), `connectionOpportunity`, `whatKindOfPeopleFlowThrough`; moved `interestingPeople` to end | ✅ |
| **Screen 3 (Taste)** — updated trustTaste + recommend labels; added 5 recommendation sub-fields in 2-col grid | ✅ |
| **Screen 4 (Rapid Fire)** — removed `busyDuringDay`; replaced `socialLink` with `contentStopsScrolling`; added `idealSaturday`, `preferredWorkout`, `localAustinBrand`, `dreamBrandPartnership`, `shoppingCart`, `spendMoreThanMost`, `topPodcasts` | ✅ |
| **Screen 5 (Tell Us About You)** — NEW screen: `whatPeopleComeToYouFor`, `heavilyInvestedIn`, `genuineExpertIn` (all required) | ✅ |
| **Screens 6/7/8** — Photos, Legal, Reveal renumbered from 5/6/7 | ✅ |
| **Progress bar** — updated from `/7` to `/8` | ✅ |
| **Answer keys** — updated to `personality.*`, `community.*`, `about.*` prefixes; backward-compat for resume drafts | ✅ |
| **Demo autofill** — DEMO_DATA, TEST_DATA, all 3 DEMO_SETS updated with new fields | ✅ |
| **Legal waiver** — untouched | ✅ |
| **FroggerGame** — untouched | ✅ |

`tsc --noEmit` clean. `next build` clean. No hex literals added.

---

## V1 Item 12 — Offline-first QR check-in PWA ✅

Branch: `feat/item-12-checkin-pwa`

| Area | Status |
|------|--------|
| `/check-in/[slug]` — staff PWA, mobile-first dark UI | ✅ (pre-existing) |
| QR scanner via `@zxing/library` + `BrowserMultiFormatReader` | ✅ (pre-existing) |
| Dexie IndexedDB schema (`CachedRsvp` + `PendingCheckIn`) | ✅ (pre-existing) |
| `GET /api/check-in/event` — guest list + event info, bearer token auth | ✅ (pre-existing) |
| `POST /api/check-in/[rsvpId]` — idempotent check-in, AuditEvent, member stats | ✅ (pre-existing) |
| Offline queue: optimistic Dexie update → sync on `window.online` | ✅ (pre-existing) |
| Manual name/email search fallback | ✅ (pre-existing) |
| Running checked-in / total count display | ✅ (pre-existing) |
| **`public/sw.js`** — service worker: cache-first `/_next/static/`, network-first-with-fallback for check-in pages | ✅ |
| **SW registration** in `CheckInClient` via `useEffect` | ✅ |
| **PWA install prompt** — `beforeinstallprompt` handler + Download button in header | ✅ |
| **`paymentStatus` + `tierName`** added to `CachedRsvp`, event API, and guest list display | ✅ |
| **Scan result** shows name + tier + payment status (success and already-in cases) | ✅ |

`tsc --noEmit` clean. `next build` clean. No hex literals added outside check-in component.

---

## V1 Items 8 + 9 — approval_required + Stripe authorize/capture ✅

Branch: `feat/item-8-9-approval-stripe`

### Item 8 — approval_required toggle

| Area | Status |
|------|--------|
| `approvalRequired` field in Prisma schema | ✅ (pre-existing) |
| RSVP creation sets `ticketStatus:'pending_approval'` when `approvalRequired=true` | ✅ (pre-existing) |
| Per-event toggle via AccessGroupsCard flow builder (derives from `eventAccess`) | ✅ (pre-existing) |
| `POST /api/operator/rsvps/[id]/approve` — confirm pending RSVP, capacity check, AuditEvent | ✅ (pre-existing) |
| `POST /api/operator/rsvps/[id]/reject` — decline pending RSVP, AuditEvent | ✅ (pre-existing) |
| **Approve button in EventAttendeesTab** (renamed from "Promote" → "Approve") | ✅ |
| **Reject button in EventAttendeesTab** for `pending_approval` RSVPs | ✅ |
| **TicketStatus column** in attendees table (Confirmed / Pending / Waitlisted / Rejected / Cancelled / Refunded) | ✅ |

### Item 9 — Stripe authorize/capture

| Area | Status |
|------|--------|
| PaymentIntent creation with `capture_method:'manual'` | ✅ (pre-existing) |
| `POST /api/stripe/capture` — operator/cron capture | ✅ (pre-existing) |
| `POST /api/stripe/refund` — full refund (cancels auth hold or issues Stripe refund) | ✅ (pre-existing) |
| Capture + Refund buttons in EventAttendeesTab with payment status badges | ✅ (pre-existing) |
| **`POST /api/operator/rsvps/[id]/cancel`** — releases AUTHORIZED hold via Stripe PI cancel; no-op for free RSVPs | ✅ |
| **Cancel button in EventAttendeesTab** for confirmed free/comp RSVPs | ✅ |
| Payment status column per attendee (AUTHORIZED / CAPTURED / REFUNDED / FREE) | ✅ (pre-existing) |
| Nightly auto-capture cron (`/api/cron/capture-payments`) 24h before event | ✅ (pre-existing) |
| AuditEvent on every transition (approve, reject, capture, refund, cancel) | ✅ |

`tsc --noEmit` clean. `next build` clean. CSS variables only, no hex literals added.

---

## Operator nav + settings fixes ✅

Branch: `feat/operator-nav-fixes`

| Change | Status |
|--------|--------|
| Sidebar: Settings link → `/operator/settings` (replaces separate Theme + Webhooks items) | ✅ |
| Sidebar: "Preview Site" + "Apply Form" external links (new-tab, below nav divider) | ✅ |
| `/operator/settings` landing page → redirects to `/operator/settings/theme` | ✅ |
| `/operator/settings/layout.tsx` — tab nav (Theme \| Webhooks) wrapping both settings pages | ✅ |
| `/operator/applications` header — "Preview form →" link (opens `/apply?demo=true` new tab) | ✅ |
| Application queue rows — "View →" hover link to `/operator/applications/[id]` | ✅ |

`tsc --noEmit` clean. `next build` clean. CSS variables only, no hex literals added.

---

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
