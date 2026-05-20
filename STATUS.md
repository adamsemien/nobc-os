# NoBC OS — Status

_Last updated: 2026-05-19_

## Current branch: `main`

## Last 5 commits
- `fix(counts)` single source of truth for all count badges
- `feat(bulk)` bulk actions on applications + members
- `feat(search)` global command palette + quick actions
- `feat(comms)` operator comments + notifications + slack
- `feat(ui)` design system primitives + page migration

## In flight
None. `tsc --noEmit` clean. Five-block session committed cleanly.

## What shipped this session

**Block A — design system primitives + migration**
- `components/ui/` — PageHeader, DataTable suite, StatusBadge (+ tone maps for
  application / rsvp / event / member / recommendation), EmptyState,
  DetailDrawer, ConfirmModal, Avatar. Single barrel at `components/ui/index.ts`.
- Legacy `app/operator/_components/{PageHeader,EmptyState,Avatar}` re-export
  from `components/ui` — older import paths keep working.
- Migrated `/operator/audit`, `/operator/applications`, `/operator/events`,
  `/operator/members`, `/operator/settings/lists`, `/theme`, `/webhooks` over
  to the new primitives.

**Block B — internal communication**
- New models: `OperatorComment` (soft-deletable, scoped by entity) and
  `OperatorNotification` (per-recipient, indexed for unread queries).
  Migration committed at `prisma/migrations/20260520120000_operator_comments_notifications/`
  but **not yet applied** — run `npx prisma migrate deploy` before deploy.
- APIs: `/api/operator/comments` (GET/POST/DELETE), `/api/operator/notifications`
  (GET/POST mark_read / mark_all_read), `/api/operator/operators` (Clerk org
  member list for mention autocomplete).
- `CommentThread` mounted on application + member detail. `@mention`
  autocomplete pulls live operators; mentions create notifications.
- `NotificationCenter` bell mounted top-right via `OperatorTopBar`. 60s poll,
  unread badge, mark-read on click, mark-all-read action.
- `lib/comments-notify.ts` `maybeFireSlack` reads `PlatformSetting`
  `slack.webhook` and per-type toggles. Wired into application submit
  (`application_new` + `application_high` at ≥ 22/30).

**Block C — global command palette + search**
- `/api/operator/search?q=` — fuzzy search across members + applications +
  events, max 5 per type.
- Existing Cmd+K palette now debounces hits into the ranked pool via
  `lib/commands/search-commands.ts`.
- New quick-action commands: Create event, Add to Purple list, Add to Blocked
  list. New nav commands: Members, Lists, Settings.

**Block D — bulk actions**
- `/api/operator/applications/bulk` — approve / reject / hold / waitlist,
  per-item atomic, returns `{ok, succeeded, failed, failures[]}`. Approve
  delegates to `approveApplication()` so welcome email + member creation
  stays identical to single-row.
- `/api/operator/members/bulk` — purple / unpurple / block / unblock / tag /
  untag. Each emits `AuditEvent` with `bulk: true`.
- ApplicationsQueue bulk bar now POSTs once to `/bulk` instead of N requests;
  Reject confirms via `ConfirmModal`.
- `MembersBulkActions` wraps the members table with sticky bulk bar + Block
  confirm.

**Block E — counts SoT**
- `/api/operator/counts` — one call, `revalidate=30`. Returns applications,
  members, events, rsvps groups. Charter / standard / waitlist on canonical
  0–1 `aiScore` tier cuts.
- `CountsProvider` polls every 60s and on a custom `nobc:counts:refresh`
  event; `useCounts()` exposes `{counts, loading, refresh}`.
- `LiveCount path fallback` — SSR fallback for first paint, hydrates from
  provider after mount.
- OperatorNav sidebar badge, applications page pill, and all tab counts wired
  through. `ApplicationsQueue` emits the refresh event after every mutation so
  sidebar stays in sync without reload.

## Known gaps
- **Migration not applied.** `OperatorComment` + `OperatorNotification` tables
  exist in schema + migration file but not in the live DB. Run
  `npx prisma migrate deploy` against Neon before deploy or comments /
  notifications will 500 at runtime.
- Operator pages still inline-render some hand-rolled tables (event detail
  tabs, intelligence sub-views) — migration sweep covered the top wave but
  not every surface.
- No role-gating on the new endpoints — they match the rest of the operator
  API (workspace-scoped, Clerk-authenticated). RBAC remains in the backlog.

## Blocked
- Apple/Google Wallet passes — PassNinja account pending.
- MCP server toolset incomplete.

## Next session
Apply migration. Smoke-test in dev:
- Comment on an application, verify @mention creates notification + bell
  badge bumps.
- Bulk-reject 3 applications, confirm sidebar count drops without reload.
- Cmd+K search "ad" — verify members + applications + events show.
- Bulk-Purple 2 members from members table.
Then deploy.
