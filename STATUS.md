# NoBC OS — Status

_Last updated: 2026-05-19_

## Current branch: `main`

## Last 5 commits
- `feat(events)` hero images, live RSVP list, member event redesign
- `feat(help)` operator + member help systems with tooltips
- `feat(member)` complete member portal — home, rsvps, profile
- `feat(dev)` AI persona runner + 50-batch seed
- `feat(workflows)` event workflow gates + editable tier names

## In flight
Nothing. All five blocks shipped. `tsc --noEmit` clean.
Migration `20260519230000_workflow_gates_and_tier_names` applied to Postgres.

## What shipped this session

**Block A — Workflows + tiers**
- `EventWorkflow` model + `Workspace.tierNames` JSON. Six templates (open, members_only, apply_or_pay, paid_only, referral_required, invitation_code). `lib/workflows/{types,templates,render,engine}.ts`.
- Event create UI: Workflow section in step 3 with template cards, per-template config, live "in plain English" gate summary.
- `/operator/settings/tiers` — Resident / Member / Considering, fully editable. `ScoreBadge` + ApplicationsQueue read configured names.
- Seed sets workflow per event (Residency: open, House Dinner: apply_or_pay $150, Founder's Circle + Members Preview: members_only, Late Night: open).

**Block B — AI persona runner**
- `/api/dev/persona/generate` — claude-sonnet-4-6 produces a Persona JSON, optional scenario input.
- `/api/dev/persona/run` — SSE streams apply / auto_approve / rsvp / pay / checkin through real platform logic. Stripe live-mode refused.
- `/api/dev/persona/seed-batch` — 50 personas spread across 6 months, statuses distributed 25p / 10h / 10a / 5r.
- DevToolbar gains an "AI QA Runner" section with scenario input, step checkboxes, live SSE log, view-persona link, and a "Seed 50 personas (AI)" button.

**Block C — Member portal**
- `/m` (new) — vanity member card (archetype, member-since, member no.), upcoming events with per-member RSVP status chips, recent RSVPs preview, footer quick links.
- Root `/` routes by role (signed-out → /apply, approved member → /m, otherwise → /operator).
- `/m/(portal)/home` becomes a server redirect to `/m`. MemberPortalNav rewired (Home → /m, Help → /m/help).
- `/m/help` reads PlatformSetting `help.member.faq` with a built-in default.

**Block D — Help system**
- `<HelpPanel>` slide-over (right side, 480px) opened by floating ? button or `?` key. 8 sections (quickstart / applications / events / workflows / check-in / lists / intelligence / shortcuts).
- `<OnboardingTour>` 5-step modal on empty operator workspaces, localStorage-dismissed.
- `<HelpTip>` (?) tooltip primitive wired into the Workflow template picker, Approval-required toggle, email-template Enabled toggle, Lists description.
- Settings → Communications gets a Member FAQ editor; saves to `help.member.faq` via `/api/operator/settings/help-faq`.

**Block E — Events polish**
- Operator Attendees tab gets `<LiveRsvpFeed>` — polls every 30s, highlights new arrivals, archetype-aware.
- `/api/operator/events/[id]/rsvps?limit&order` returns enriched rows (archetype joined via Application).
- `/m/events/[slug]` renders a "How to attend" card listing every workflow path with its `renderPathSummary` line under the existing template.
- Hero image system (`heroImageAssetId`, `HeroImageUpload`, `getEventHeroDisplayUrl`) confirmed working from prior session.

## Blocked
- Apple/Google Wallet passes — PassNinja account pending.
- MCP server toolset incomplete.
- Custom workflows (mix-and-match steps) — V2.

## Next session
Smoke test in production:
1. Workflow picker on a new event — confirm EventWorkflow row created.
2. `/operator/settings/tiers` — rename, verify ApplicationsQueue + ScoreBadge update.
3. DevToolbar — "Generate & Run" with scenario "founder from NYC" hits all steps cleanly.
4. `/m` — vanity card renders, footer links work.
5. ? key opens HelpPanel; ? icon (bottom-left) opens it too.
