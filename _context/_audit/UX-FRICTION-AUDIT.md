# UX Friction Audit — Member & Guest Surfaces

> **Read-only audit. No code shipped with this document.**
> Date: 2026-06-09 · Auditor: Draft (UX) via Claude Code · Branch: `docs/ux-friction-audit`
> Thesis under test: `PRODUCER-OPERATOR-STRATEGY.md` §10.3 — *members/guests are the growth
> engine; the attendee experience must beat Lu.ma and Posh so "the people will make it known."*
> This audit judges every member-facing moment against that bar.

## Method & coverage

- **Code recon (complete):** event discovery (`/m/events`), event detail + the 3 editorial
  templates (Split / Editorial / Minimal), access states and copy (`lib/event-access.ts`,
  `RsvpCard`, `EventAccessFlow`), confirmation (`/m/events/[slug]/confirmed`), member portal
  (`/m`, `/m/(portal)/*`, `/m/pass`), and the full `/apply` flow including emails.
- **Code recon (partial):** the interior of the Stripe checkout step and the ticketing error
  map were not independently walked in this pass (recon agent failed mid-run; the access-gate
  + error-map behavior is covered by the tests on `tests/money-path-access-gate`). Findings
  for the paid path below come from the surrounding flow code, not the checkout internals.
- **Benchmark basis:** Lu.ma and Posh comparisons are from product knowledge as of early
  2026 — **not live-verified in this pass** (research agent failed). Treat specific tap
  counts as directional; the patterns cited are stable, core behaviors of both products.
- **Constraints honored:** locked terminology (Access / Event Access — never "RSVP" in UI;
  Member/Guest/Comp Access; "Register" / "Apply to Attend" / "Get Ticket — $X"); semantic
  tokens only; sponsor firewall (no operator data on any member/guest surface — none found
  on the audited surfaces; DAM share surfaces `/assets/[token]` + `/gallery/[slug]` were out
  of scope). No code, no visual-system design — flows, IA, states, copy only.

---

## 1. Executive verdict

**The core loop works and the copy voice is genuinely better than Lu.ma's — but the
experience loses to Lu.ma and Posh at the edges, and the edges are where the growth loop
lives.** Three structural problems:

1. **The viral loop is amputated.** Share and add-to-calendar exist only *after*
   confirmation. On Lu.ma, every event page is a shareable, calendar-able artifact —
   that's how attendee → organizer growth happens. Our event page is a beautiful
   dead-end for anyone who isn't ready to commit this second.
2. **Resilience is below the bar.** No `loading.tsx` / `error.tsx` / branded `not-found`
   anywhere on the member tree. A slow query is a blank screen; a DB hiccup is a raw
   error page; a dead shared link is a generic 404. Lu.ma never shows you nothing.
3. **The apply flow — our single biggest differentiator over Lu.ma/Posh — can silently
   destroy 25–40 minutes of an applicant's work** on a refresh, and then drops the
   applicant into an email-or-nothing void until a decision arrives.

None of these require new product surface. They are state coverage, link placement, and
copy. That's the cheapest possible way to close the gap to "people will make it known."

---

## 2. Prioritized friction map

Severity: **P0** = breaks trust or the money/growth path · **P1** = measurably worse than
Lu.ma/Posh at the same moment · **P2** = polish & consistency.

| # | Sev | Surface | Friction | Evidence | Lu.ma / Posh at the same moment |
|---|-----|---------|----------|----------|--------------------------------|
| 1 | P0 | `/apply` | Form state lives only in client `useState`; refresh/network blip loses the whole ~25–40 min application. Resume banner is wired (`showResumeBanner`) but never populated — resume is non-functional. | `app/apply/_components/MembershipForm.tsx` (~L413–431); only `nobc-apply-theme` in localStorage | Neither has a long-form flow this valuable; Typeform-class tools autosave per screen. Our differentiator must not be our biggest data-loss risk. |
| 2 | P0 | Event detail (all 3 templates) | **Past events still render live CTAs** ("Register" / "Get Ticket — $X"). No "this gathering has passed" state; access only checks `closed`, never `startAt < now`. | `TemplateSplit/Editorial/Minimal.tsx`, `RsvpCard.tsx` — no date gate | Lu.ma flips the page to "This event has ended" + recap; Posh closes sales and shows the gallery. A guest paying for a past event is a refund + trust incident. |
| 3 | P0 | Whole `/m` tree | No `error.tsx`, no `loading.tsx`, no custom `not-found.tsx` on any member route. Slow fetch = blank white screen; DB failure = default Next error; dead/shared event link = generic 404. | `app/m/events/page.tsx`, `app/m/events/[slug]/page.tsx`, all `(portal)` routes — files absent | Lu.ma: skeletons on every surface, branded 404 with "explore events" exit. Shared links are the top of our growth funnel — a generic 404 is a dead end at the front door. |
| 4 | P0 | Post-apply | **Pending applicants have no status surface.** `/apply/thanks` is terminal; `/m/application` requires an approved Clerk-linked member. If the decision email lands in spam, the applicant is stuck forever, silently. | `app/apply/thanks/page.tsx`; `/m/(portal)/application` gated on member | Lu.ma approval events show a persistent "Pending approval" state on the event page itself, on every revisit. |
| 5 | P0 | `/m/(portal)/rsvps` + Help | Help FAQ promises "Cancel from My RSVPs as early as you can" but **no cancel control exists** on the list. A promised feature that isn't there is a dead end *and* a support ticket. | `help/page.tsx` DEFAULT_FAQ vs `RsvpList` (no cancel affordance) | Lu.ma: one-click "Can't attend?" on every registration. Posh: self-serve up to event policy. |
| 6 | P1 | Event detail | **Share and add-to-calendar exist only post-confirmation.** `ShareButton` only on `/confirmed`; `calendarUrl()` only inside `EventAccessFlow` DoneScreen. The event page itself can't be shared or calendared. | `confirmed/_components/ShareButton.tsx`; `EventAccessFlow.tsx` | Lu.ma: share + calendar on every event page, registered or not — the engine of its attendee→host loop. |
| 7 | P1 | Portal nav | **Member QR is undiscoverable.** `/m/pass` exists but is linked from nowhere — nav is Home · Events · RSVPs · Profile · Help. At the door, a member can't find their own pass. | `MemberPortalNav.tsx`; `app/m/pass/page.tsx` | Posh: ticket QR is the first thing in the app/SMS. Lu.ma: ticket front-and-center in confirmation email + event page. |
| 8 | P1 | All event surfaces | **No timezone anywhere.** "FRI · 6 JUN · 2026 · 6:30 PM" with no TZ label; `Intl.DateTimeFormat` without `timeZone`; no TZ field on Event. | `event-format.ts` (`formatDateLine`/`formatTimeLine`) | Lu.ma renders in the viewer's timezone and labels it. Multi-city = wrong-arrival risk. |
| 9 | P1 | `/apply` screen 6 | **Photo upload fails silently** — a failed upload pushes `''` into the submission and the applicant never knows. | `MembershipForm.tsx` ~L787–793 (`catch { uploadedUrls.push('') }`) | Table stakes elsewhere: inline retry with an error message. |
| 10 | P1 | Nav + Help copy | **Terminology-law violations in member UI:** nav label "RSVPs", page "My RSVPs", FAQ "How do I RSVP?". CLAUDE.md: never "RSVP" in member-facing copy. | `MemberPortalNav.tsx`; `rsvps/page.tsx`; `help/page.tsx` | n/a — internal law. Fixes in §6. |
| 11 | P1 | `/m/pass` | Wallet buttons tease a feature that no-ops (`PASSNINJA_*` unset): "Wallet pass will be available shortly after approval" — indefinitely. | `app/m/pass/page.tsx` | Posh wallet passes just work; better to under-promise until env is set. |
| 12 | P1 | `/m/(portal)/profile` | No visible save confirmation — member edits, clicks save, gets silence. | `ProfileForm` (no success feedback path found) | Universal pattern: inline "Saved" state. |
| 13 | P1 | Event lifecycle | **No cancelled-event state.** Events hard-delete; registered members get a 404, not "this gathering was cancelled." (Schema gap — flagged here as a flow gap only; any schema change goes through the additive-migration workflow.) | Prisma `Event` (no cancelled flag); hard delete | Lu.ma keeps cancelled pages live with an explanation + notifies registrants. |
| 14 | P2 | `/apply` screen 5 | Referrer fields after the first are labeled generically ("referrer", "referrer") — reads like a copy-paste bug. | `lib/apply-config.ts` referrer fields | — |
| 15 | P2 | Decline email | Gracious but terminal — no "you're welcome to apply again" re-engagement line. (Email copy change; suggest only — Adam signs off all apply-adjacent copy.) | `emails/DeclineEmail.tsx` | — |
| 16 | P2 | Discovery cards | Location is plain text on cards (detail page links `mapsUrl`; card doesn't). | `MemberEventsExplorer.tsx` EventCard | Lu.ma cards: tap-through to map. |
| 17 | P2 | Templates | Capacity callout ("Limited to X spots") only on Split; Editorial/Minimal rely on the RsvpCard meter alone — scarcity signal varies by operator's template choice. | `TemplateSplit.tsx` vs others | Lu.ma shows "X spots left" uniformly. |
| 18 | P2 | `/m` home | Generic "Your membership is being set up." with no timeline or escape hatch when the Member row lags Clerk. | `/m` page member-null branch | — |
| 19 | P2 | `/m` home | Registrations needing follow-through (plus-one names, photos) aren't surfaced on home — members discover gaps at the door. | home page sections | Posh nags via SMS for incomplete items. |
| 20 | P2 | Portal | No breadcrumbs / contextual back on deep routes (`/m/events/[slug]/confirmed` → nav bar only). | `(portal)` layout | — |
| 21 | P2 | `/apply` | 560 px fixed-width assumptions + large serif display faces — verify ≤375 px viewports and ≥44 px touch targets (flagged from code, not device-tested). | `MembershipForm.tsx` layout | Posh is mobile-first; most applicants will be on phones. |

**Already at or above the bar (do not touch):** locked CTA copy is implemented exactly
("Register", "Apply to Attend", "Get Ticket — $X", "You're on the list"); no raw enum
leakage found on member surfaces; warm closed-event copy ("This gathering is open to No
Bad Company members." + apply hand-off) is *better* than Lu.ma's cold lock screen; the
three templates are genuinely differentiated; waitlist/pending/confirmed card states all
have humane copy; the confirmation page (QR + wallet + share + detail rows) is a strong
artifact; discovery empty state "Nothing scheduled yet. Stay close." is on-brand.

---

## 3. Flow-by-flow walkthrough vs the bar

### 3.1 Discovery (`/m/events`)

**Now:** auth-gated grid, hero image, title, date, location (plain text), access label,
empty state present. No loading skeleton, no error boundary, no past-events view, no
search/filter confirmed.

**Bar:** Lu.ma discovery is calendar-subscribable and timezone-aware; Posh leans on city
pages + hype. We don't need a public discovery surface yet (curation is the brand), but a
member should never see a blank screen while the grid loads (#3), and a member who wants
the map shouldn't have to enter the event first (#16).

### 3.2 Event detail (Split / Editorial / Minimal)

**Now:** strong editorial presentation; sticky/inline access card; correct locked CTAs;
capacity meter; closed-event warm copy with apply hand-off; hero fallback when no image.

**Gaps vs bar:** no share, no add-to-calendar (#6), no timezone (#8), no past-event state
(#2), no guest-facing social proof at all (Lu.ma shows host + attendee avatars — for a
private club, even "Hosted by No Bad Company · 42 attending" respects the vibe while
signaling life; worth a deliberate decision rather than an accident of omission), and
custom registration fields are invisible until mid-flow (#22-adjacent; minor).

### 3.3 Access flows (open / apply-to-attend / ticketed)

**Now:** open = CTA → confirm ("You're on the list"); approval = "Apply to Attend" →
"Request received / Your request is in — we'll be in touch shortly."; ticketed = "Get
Ticket — $X" → Stripe authorize/capture; waitlist auto-engages at capacity with humane
copy; plus-ones supported; guest (non-member) path exists.

**Gaps vs bar:** Lu.ma's registered-user path is one tap; its logged-out path is
email + OTP with **no password and no pre-commitment account wall**. Posh is
phone-first + Apple Pay, ~3 taps to a paid ticket. Our flow's step count for a
signed-out guest could not be fully verified this pass (see Method) — **action: walk the
guest ticketed path end-to-end on a phone and count taps/fields; everything beyond
email + payment sheet is debt.** Also unverified this pass: Apple/Google Pay presence,
double-submit protection, capacity race messaging, mid-flow back-button behavior. The
approval mode's *pending* state lives only on the event page card — fine for members,
but there is no notification-of-decision surface other than email.

### 3.4 Confirmation + ticket delivery (`/confirmed`)

**Now:** QR ("Show at check-in"), wallet buttons, share, Google-Calendar link inside the
flow's done screen, tokenized link that survives without a session, fallback copy for
expired links. Genuinely good.

**Gaps vs bar:** calendar on the done screen offers Google only (Lu.ma: Apple/Outlook/ICS
too); wallet buttons no-op until env is set (#11); no "invite a friend" affordance at the
exact moment of peak enthusiasm — Lu.ma converts confirmation into distribution, we end
the moment.

### 3.5 Member portal (`/m`, portal routes, `/m/pass`)

**Now:** warm home ("Welcome back, {firstName}", member card, next events, recent
registrations), application review page, profile, help FAQ, pass page.

**Gaps vs bar:** QR undiscoverable (#7), terminology violations in nav/FAQ (#10), no
cancel path (#5), silent profile saves (#12), no follow-through nudges (#19).

### 3.6 Apply flow (`/apply`)

**Now:** 9 screens (welcome → basics → essays → taste → rapid-fire → referrers → photos →
waiver → archetype reveal). The archetype reveal with spectrum animation is a signature
moment no competitor has. Decision emails are warm and on-voice.

**Gaps vs bar:** data loss on refresh (#1), silent photo failure (#9), submit-error
recovery unclear ("Something went wrong." with no retry CTA), pending void (#4),
referrer labels (#14), decline dead-end (#15), mobile verification (#21).
*(Waiver legal copy on screen 7: untouched, unquoted, out of scope per lock.)*

---

## 4. Heuristics summary (Nielsen)

| Heuristic | Verdict | Driving findings |
|---|---|---|
| 1. Visibility of system status | ✗ **worst area** | #3 loading/error gaps, #1 no autosave signal, #12 silent saves, #9 silent upload failure |
| 2. Match with real world | ✓ mostly | timezone gap #8; voice otherwise excellent |
| 3. User control & freedom | ✗ | #5 no cancel, #1 no resume, no undo after registering |
| 4. Consistency & standards | ✗ | #10 RSVP drift, #17 capacity inconsistency, #14 labels |
| 5. Error prevention | ✗ | #2 past-event purchase, double-submit unverified |
| 6. Recognition over recall | ✗ | #7 QR requires knowing a URL |
| 7. Flexibility & efficiency | ✓ adequate | one-CTA flows are appropriately minimal |
| 8. Minimalist design | ✓ strong | templates are disciplined |
| 9. Error recovery | ✗ | #3 raw errors, apply submit-error path |
| 10. Help & documentation | ~ | FAQ exists but over-promises (#5) and uses banned term (#10) |

---

## 5. IA & flow recommendations

**IA (member nav).** `Home · Events · My Events · Pass · Profile · Help` — renames
"RSVPs" (law) and surfaces the pass (#7, #10). Alternative if nav must stay 5 items: put
a "Your pass" tile on the member card on `/m` home. Either way the QR must be reachable
in one obvious tap from home.

**Flow: event page as shareable artifact (#6, #8, #16).** Add Share (Web Share API
already exists in the codebase) and Add to Calendar (Google + Apple/ICS) to the event
detail meta block on all three templates, pre-registration. Label times with the event's
timezone. This is the single highest-leverage growth change in this audit.

**Flow: event lifecycle states (#2, #13, #3).** Gate access on `startAt < now` → passed
state (copy in §6) with a pointer to upcoming events. Add branded `not-found` and
`error.tsx` + `loading.tsx` skeletons across the `/m` tree. Treat "cancelled" as a
first-class state when the schema next gets an additive change (separately authorized).

**Flow: applicant continuity (#1, #4).** Autosave per screen (the draft `PATCH` API
already exists — `PATCH /api/apply/membership/[id]` — wire the existing resume banner to
it), warn on page-leave with unsaved state, and give `/apply/thanks` a persistent status
mechanism (simplest: "We'll email you either way — add team@thenobadcompany.com to your
contacts"; better: a tokenized status link in the submission-received email, mirroring
the `/confirmed` token pattern that already exists for event access).

**Flow: self-serve cancel (#5).** Until a cancel control ships on My Events, fix the FAQ
copy to match reality (§6). When it ships: each row gets "Can't make it?" → confirm →
frees the spot (auto-promote waitlist already exists server-side).

**Flow: confirmation as distribution.** Add "Bring someone?" (share link) to the done
screen — peak-enthusiasm moment, zero new backend.

---

## 6. Exact copy fixes

All copy below honors the terminology law. Items touching `/apply` or emails are
**proposals requiring Adam's sign-off** (apply flow is locked); the rest are direct fixes.

| # | Location | Current | Replace with |
|---|----------|---------|--------------|
| C1 | Member nav + `/m/(portal)/rsvps` title | "RSVPs" / "My RSVPs" | **"My Events"** |
| C2 | Help FAQ question | "How do I RSVP?" | **"How does Event Access work?"** |
| C3 | Help FAQ answer (access) | (current answer) | **"Every gathering shows one of three doors: Register (open), Apply to Attend (curated), or Get Ticket (paid). Tap it and we'll walk you through."** |
| C4 | Help FAQ answer (cancel) — until a cancel control exists | "Cancel from My RSVPs as early as you can." | **"Plans change — email team@thenobadcompany.com as early as you can and we'll release your spot."** *(revert to self-serve copy once the control ships)* |
| C5 | Past event state (new) | — (live CTAs) | Eyebrow **"This gathering has passed"** · body **"Thanks to everyone who came. See what's next on the calendar."** · link **"Upcoming events"** |
| C6 | Event not-found (new `not-found` copy) | generic 404 | **"This gathering isn't on the calendar."** · **"It may have ended or moved. The calendar has what's next."** · link **"See upcoming events"** |
| C7 | Member-tree error boundary (new) | raw error | **"Something went sideways on our end."** · **"Give it a moment and try again — or email team@thenobadcompany.com and we'll sort it."** · button **"Try again"** |
| C8 | `/m` home, member-row lag | "Your membership is being set up." | **"Your membership is being set up — this usually takes a moment. If it's still here after a refresh, email team@thenobadcompany.com."** |
| C9 | `/m/pass` wallet placeholder (while `PASSNINJA_*` unset) | "Wallet pass will be available shortly after approval." | **"Wallet passes are coming soon. Your QR below works at the door today."** |
| C10 | `/m/pass` discoverability (nav label) | — | **"Pass"** |
| C11 | Apply screen 5 referrer labels *(sign-off req.)* | "referrer" / "referrer" | **"Second referrer (optional)"** / **"Third referrer (optional)"** |
| C12 | Apply photo-upload failure *(sign-off req.)* | silent | **"That photo didn't make it — tap to try again. You can also submit without it."** |
| C13 | Apply submit error *(sign-off req.)* | "Something went wrong." | **"Something went wrong on our end — your answers are safe. Tap to try again."** *(only truthful once autosave ships — pair with #1)* |
| C14 | Decline email *(sign-off req.)* | (current close) | append: **"Doors open again — you're welcome to apply in a future season."** |
| C15 | `/apply/thanks` *(sign-off req.)* | "We got it. We'll be in touch. …" | append: **"Add team@thenobadcompany.com to your contacts so the answer doesn't land in spam."** |
| C16 | Done screen invite (new) | — | **"Bring someone? Share the event."** |

---

## 7. Top priority fix

**If only one thing gets fixed: #6 — put Share + Add to Calendar (with timezone) on the
event page itself, all three templates.** The §10.3 thesis is that guests evangelize the
experience; today the experience literally cannot be passed along until after someone has
committed. #1 (apply autosave) is the biggest *trust* fix; #6 is the biggest *growth* fix —
and growth is the thesis.

Suggested sequence: **#6 → #2 → #3 → #1 → #4 → #5/#10 (one PR: nav + FAQ + cancel copy)**
→ remainder of P1 → P2.

---

*End of audit. Findings only — no code changes accompany this document.*
