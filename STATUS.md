# NoBC OS — Status

_Last updated: 2026-05-19_

## Current branch: `main`

## Last 5 commits
- `feat(operator)` nav overhaul, dashboard, settings landing, members, check-in hub
- `feat(operator)` route-level loading skeletons + Producer UI reference
- `fix(operator)` semantic tokens + theme-aware fonts in operator UI
- `fix(mcp)` security + audit hardening on MCP tool surface
- `feat(operator)` AgentPanel — Cmd+Shift+A AI agent chat panel

## In flight (uncommitted)
Communications stack + live-feel polish. All TS clean, three migrations pending:
- `prisma/migrations/20260519100000_workspace_ai_model` — Workspace.aiModel
- `prisma/migrations/20260519110000_communications` — EmailTemplate + PlatformSetting
- `prisma/migrations/20260519120000_rsvp_reminder_plus_one` — RSVP.reminderSentAt, plusOneName, plusOneInstagram

Apply with: `npx prisma migrate deploy` (or `migrate dev` locally).

## What shipped this session
- Sidebar: Dashboard / Applications (pending badge) / Events / Check-in / Members / Lists / Intelligence / Activity / Settings (footer).
- Dashboard at /operator: 4 stat cards, Action Required, upcoming events w/ capacity + Room buttons, recent Activity feed.
- The Room (event night dashboard) — vibe line, confetti, chime, VIP marker, last-arrival spotlight, capacity gauge.
- Check-in Hub at /operator/check-in.
- Members route + member detail with archetype, score (0–100), VIP marker.
- Application form builder — /operator/settings/application.
- AI Model switcher — /operator/settings/model, persists to Workspace.aiModel.
- Communications — /operator/settings/communications: EmailTemplate + PlatformSetting CRUD, default templates seeded.
- `lib/email.ts` `sendTemplatedEmail()` — all future sends go through here.
- Event publish → fan-out to APPROVED members via `event.published` template (gated by `event.notify_on_publish`).
- Day-of reminder cron at `/api/cron/event-reminders` + vercel.json schedule (15:00 UTC).
- Walk-in registration on the check-in PWA (UserPlus button) → /api/check-in/walkin.
- Plus-one capture: RSVP fields (`plusOneName`, `plusOneInstagram`), wired through `submitMemberRsvp` and surfaced in operator RSVP queries.
- Scoring display: 0–100 + tier (Charter / Standard / Waitlist) via `lib/score-display.ts` + `<ScoreBadge>`.
- Avatar primitive: pravatar fallback by email hash, used in dashboard, members, applications queue + detail.
- Application detail: avatar header + IG / portfolio chips parsed from answers.
- Event detail: persistent action bar (Check In / The Room / Publish / Cancel / Edit) + breadcrumbs.
- Breadcrumbs on applications + members + settings detail pages.
- Audit → Activity rename (label only; URL kept at `/operator/audit`).
- Favicon at `app/icon.svg` + `app/apple-icon.svg`.
- Seed expansion: 30 members, 20 pending applications (5 borderline), Late Night past event 100% checked in, Residency with 8 live check-ins in the last 2 hours so The Room shows real data.

## Blocked
- Item 11 (Apple/Google Wallet passes) — PassNinja account pending.
- Item 17 (MCP server) — toolset incomplete.
- Member-side event detail redesign (Task 9) and hero-image upload UI (Task 6) deferred.

## Next session should start with
Apply the three pending migrations, then deploy. Smoke test:
1. Settings → Communications loads and shows 6 templates + 4 settings.
2. Publish an event → check audit log for `event.notification_sent`.
3. Check-in PWA → Add walk-in → verify member + RSVP created + audit row.
