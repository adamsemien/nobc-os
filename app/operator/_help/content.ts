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
    body: `Welcome. NoBC OS runs your application queue, your events, and your check-in night.

Most days, you live in three places:
1. **Applications** — review incoming, approve/hold/reject. The pending count in the sidebar is your inbox.
2. **Events** — create, edit, publish. Each event has a Workflow that defines who can RSVP and how.
3. **Check-in / The Room** — on event night, open The Room on a tablet to watch the floor fill up live.

Keyboard: Cmd+K opens the global search. Cmd+Shift+A opens the AI agent. ? opens this panel.`,
  },
  {
    id: 'applications',
    title: 'Applications',
    body: `Applications come in through /apply and land here as PENDING.

The score (0–100) and recommendation come from AI scoring against your active questions in Settings → Application Form. Each question has a scoring dimension and weight — change those and scoring follows.

Tiers (Resident / Member / Considering by default — editable at Settings → Member Tiers):
- Top tier: 73–100 — strong yes, move fast.
- Middle: 53–72 — solid yes.
- Lower: under 53 — waitlist or pass.

Approving creates a Member record + sends the welcome email. Rejecting and waitlisting send their own templates (Communications). Hold parks an application without notifying the applicant — used when a Red List match or duplicate needs review.`,
  },
  {
    id: 'events',
    title: 'Events',
    body: `Events have four steps to create: Draft, Details, Access, Template.

- **Draft**: paste a prompt and let AI fill the form, or start from scratch.
- **Details**: title, slug, date, location, hero image, capacity.
- **Access**: pick a Workflow template and Access groups (members / guests / comp).
- **Template**: the layout members see on the public page.

Status is DRAFT until you publish. Publishing fires the event.published email to all approved members (gated by Communications → event.notify_on_publish). Day-of, a cron sends event.reminder to confirmed RSVPs.

You can edit any event at any time. The Activity log records every change.`,
  },
  {
    id: 'workflows',
    title: 'Event workflows',
    body: `Workflows tell the platform who can RSVP and how. Six templates:

- **Open** — anyone, free, no questions.
- **Members only** — must be an approved member (optionally above a minimum tier).
- **Apply or pay** — submit an application, OR pay to skip the line. Sub-options: price, approval required.
- **Ticketed** — paid entry only.
- **Referral required** — must be referred by N members.
- **Invitation code** — must enter a valid code (codes are operator-set per event).

The live "in plain English" panel updates as you change settings so you can read your own rules back. Custom workflows (mix-and-match steps) are coming soon.`,
  },
  {
    id: 'checkin',
    title: 'Check-in & The Room',
    body: `Two surfaces, same event night:

- **Check-in Hub** (/operator/check-in) — pick the event. Open the PWA on a phone or tablet. It works offline (IndexedDB) and syncs when the connection returns.
- **The Room** — the live floor view. Capacity gauge, waitlist count, recent arrivals, "in the room" archetype grid, optional VIP markers, arrival chime, and the AI vibe descriptor (updates every 30 minutes).

Walk-in registration is built into the PWA — UserPlus button. Creates a member + RSVP + audit row, fires the walkin.welcome email.

Open The Room from any event detail page (top-right action bar) or from /operator on event day.`,
  },
  {
    id: 'lists',
    title: 'Lists',
    body: `Two list types live in Settings → Lists:

- **Purple** — VIPs, people you want to be alerted about. Marked with ✦ in The Room and on member detail.
- **Blocked** — never approve, never sell tickets to. Application submission auto-rejects on a Blocked match.

Both lists match by email, phone, and Instagram handle. The Hold queue on Applications surfaces applications that match a Red List entry — review each manually.`,
  },
  {
    id: 'intelligence',
    title: 'Intelligence',
    body: `Intelligence is the analytics layer. Four views:

- **Community** — member composition, archetype mix, neighborhood density, drill-downs by tier.
- **Insights** — generated insights about pipeline health, sponsor fit, growth trends.
- **Sponsors** — sponsor fit scores against your member base.
- **Trends** — historical patterns.

Most metrics use a 0–30 worth score derived from archetype scores (a different metric from the 0–100 application score). Filter by date range, tier, archetype.

Demo mode (toggle top-right) replays synthetic data for review screens and pitch decks.`,
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    body: `**Global**
- Cmd+K — search / navigate
- Cmd+Shift+A — open the AI agent
- ? — open this help panel
- Esc — close any open panel

**Applications**
- j / k — navigate up/down the queue
- a — approve selected
- h — hold
- r — reject
- / — focus search

**Events**
- n — new event (from Events list)

**Settings → Application Form**
- Cmd+D — duplicate selected question`,
  },
];
