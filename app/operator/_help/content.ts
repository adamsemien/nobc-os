/** Operator help content. Rendered in the slide-over help panel.
 *  Plain markdown-ish strings — line breaks survive, no JSX. */

export type HelpSection = {
  id: string;
  title: string;
  body: string;
};

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'quickstart',
    title: 'Quick start',
    body: `Your first event in three moves:

1. **Open Events → New.** Paste a prompt and let the AI builder draft the page, or fill it by hand. Title, slug, date, location, hero image, capacity — give it the basics.
2. **Pick the Access workflow.** Open is the simplest (anyone, free). Apply or Pay is the most NoBC (fill out the form OR pay to skip the line). The "in plain English" panel reads your own rules back to you.
3. **Publish.** That fires the published email to approved members and the event becomes live at /m/events/[slug].

That's it. The rest of the platform — Applications, Intelligence, Check-in — is where you spend the days between events.

The way we think about it: the operator does five things — review applications, build events, watch the room, read the patterns, send the right message. Everything else is sidecar.`,
  },
  {
    id: 'applications',
    title: 'Applications',
    body: `Every application lands here as PENDING. The score and recommendation are AI — and the AI only knows what your questions told it.

**How the scoring works.** Each question in Settings → Application Form carries a dimension (influence / contribution / activation / taste) and a weight. The AI reads each answer against the question's own scoring logic and aggregates. Add a new question and it auto-includes; remove one and nothing breaks. The model returns an archetype guess (Connector / Host / Curator / Builder / Maker / Patron) plus a 0–1 score that maps to your tiers.

**Tiers** (rename them in Settings → Member Tiers):
- Charter — score ≥ 0.73 (22+/30). Strong yes, move fast, consider the personal note.
- Standard — score ≥ 0.53 (16+/30). Solid yes.
- Waitlist — below 0.53. Park or pass.

**When to override the AI.** When you know something the form doesn't. The score is a starting point, not a verdict — it can't see who they came in with, what room they were in last Tuesday, the energy they bring to a dinner. Use Hold for anything ambiguous (a Red List match, a duplicate, a "wait, isn't this her ex's company"). Hold doesn't notify the applicant — gives you time.

The way we think about it: the queue is your taste expressed at scale. The AI helps you go faster on the obvious yes/no — the middle is where you earn the membership.`,
  },
  {
    id: 'events',
    title: 'Events',
    body: `Four steps to create: Draft → Details → Access → Template.

- **Draft.** Paste a prompt ("intimate dinner for 20 in East Austin, Thursday, $75") and the AI builder fills the form. Or start blank.
- **Details.** Title, slug, date, location, hero image (Blob URL passthrough — drop in any link), capacity.
- **Access.** Pick a workflow (see the Workflows section). Add Access groups — who can register from Member Access, Guest Access, Comp Access.
- **Template.** Three layouts for the public page — pick the one that fits the vibe.

**Status: Draft until you publish.** Publishing fires event.published to approved members (gated by Communications → event.notify_on_publish — toggle off if you don't want the broadcast). Day-of, the reminder cron sends event.reminder to confirmed registrations.

**Edit anything any time.** The Activity log on each event records every change with actor + timestamp.

The way we think about it: an event is a workflow, not a page. The page is the surface; the workflow is who gets in and how. Get the workflow right and the page mostly writes itself.`,
  },
  {
    id: 'workflows',
    title: 'Event workflows',
    body: `Workflows tell the platform two things: who can register, and how. Six templates:

- **Open** — anyone, free, no questions. Use for: a public meetup, a townhall, anything where friction kills it.
- **Members only** — must be an approved member. Optional minimum tier (e.g., Charter-only nights). Use for: the actual member calendar.
- **Apply or Pay** — submit an application OR pay to skip. Like a Facebook like-gate — fill out the form, or pay the $X to bypass. Use for: events with a curated guest list but a paid backdoor for the right people.
- **Ticketed** — paid entry, no application. Use for: revenue events, public-facing fundraisers.
- **Referral required** — must be referred by N members. Use for: invite-only series, by-someone-you-know nights.
- **Invitation code** — must enter a valid code (operator-set per event). Use for: hard-to-find guest lists, post-event afterparties, founder dinners.

**Sub-options that matter.** Approval required (operator gates each application before access), price (for Apply or Pay / Ticketed), capacity + waitlist behavior. The "in plain English" panel updates live as you change things — read it back to yourself.

The way we think about it: every event has a door. The workflow IS the door. Custom workflows (mix-and-match steps — referral + payment + question) are coming.`,
  },
  {
    id: 'checkin',
    title: 'Check-in & The Room',
    body: `Two surfaces, same event night:

**Check-in Hub** (/operator/check-in). Pick the event. Open the PWA on a tablet at the door. Works offline (IndexedDB + Dexie), syncs on reconnect. Walk-in registration is built in — UserPlus button creates a member + registration + audit row and fires walkin.welcome.

**The Room.** The live floor view. Capacity gauge, waitlist count, recent arrivals, "in the room" archetype grid, optional VIP markers (Purple List ✦), arrival chime, AI vibe descriptor that updates every 30 minutes ("playful, slightly buzzed, two strong founder pairs forming").

**Day-of playbook:**
1. 30 min before: open Check-in on the door tablet (verify offline mode works — toggle wifi off, scan a QR).
2. Door opens: chime audible to staff, scan-as-they-arrive. Walk-ins through UserPlus.
3. During: pull up The Room on a private screen — useful when a host asks "who's here?" or you're deciding when to start the program.
4. After: capacity gauge tells you the attendance rate. Anyone who didn't show drops to a no-show stat the next morning.

Open The Room from any event detail page (top-right action bar) or from /operator on event day. Both staff and operators have access.`,
  },
  {
    id: 'lists',
    title: 'Lists',
    body: `Two lists in Settings → Lists. Both match by email, phone, and Instagram.

- **Purple ✦** — the VIPs. People you want flagged when they arrive or apply. Shown with ✦ in The Room arrival feed, on member detail, in attendee lists. Use for: investors, returning hosts, people you owe a hello, journalists, anyone you don't want to walk past unnoticed.
- **Blocked** — never approve, never sell. Application submission auto-rejects on a Blocked match (silently — no notification to the applicant). Use for: documented bad actors, conflicts of interest, anyone you've removed.

**Hold queue.** When an application matches the Red List (Blocked + adjacent flags), it lands on Hold instead of auto-rejecting so you can eyeball it. Hold ≠ rejected — it's parked until you decide.

The way we think about it: the Purple List is taste. The Blocked List is hygiene. Keep both lean — every entry is a thing you're committing to remember.`,
  },
  {
    id: 'intelligence',
    title: 'Intelligence',
    body: `Intelligence is the analytics layer — four views, all member-data-driven:

- **Community.** Composition: archetype mix, neighborhood density, tier breakdown. Click any tile to drill into the underlying members. This is what you show a partner who asks "who's in your club?"
- **Insights.** Pattern-detected narratives the AI surfaces — "your Charter tier grew 18% this month, mostly Makers from East Austin." Filter by date range to compare periods.
- **Sponsors.** Sponsor-fit scores against your member base by segment (e.g., wealth mgmt resonates with Patrons, watches with Connectors). Useful for partnership pitches.
- **Trends.** Historical patterns — attendance over time, archetype drift, conversion from application to first-event.

**Two scores, don't confuse them.** Application score (0–100, AI scoring) is for the pending-app queue. Worth score (0–30, derived from archetype dimensions) is the Intelligence metric — it's what drives Community + Sponsors. Different inputs, different purposes.

**Demo mode** (top-right toggle): replays synthetic data so you can show the screens to a partner or a prospective tenant without exposing real member info.

The way we think about it: Intelligence is not a vanity dashboard — it's how you decide what event to do next, who to invite, what partner to call. If a chart can't change a decision, it shouldn't be a chart.`,
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    body: `**Global**
- Cmd+K — search & navigate (events, members, applications, settings)
- Cmd+Shift+Option+A — open the AI agent panel
- Cmd+Shift+Option+D — open the dev toolbar (DEV_USER_IDS only)
- ? — open this help panel
- Esc — close any open panel

**Applications**
- j / k — move up / down the queue
- a — approve selected
- h — hold
- r — reject
- / — focus the search

If something doesn't fire, click into the main area first (some browsers swallow shortcuts when focus is on a sidebar or modal).`,
  },
];
