# NoBC OS — Status

_Last updated: 2026-05-19_

## Current branch: `main`

## Last 5 commits
- `fix(validation)` zod schemas, length caps, phone normalization, inline client validation
- `fix(counts)` single source of truth for all count badges
- `feat(bulk)` bulk actions on applications + members
- `feat(search)` global command palette + quick actions
- `feat(comms)` operator comments + notifications + slack

## In flight
QA Game Mode — gamified manual-testing tool in the dev toolbar.
Uncommitted. `tsc --noEmit` clean.

## What shipped this session (uncommitted)

**QA Game Mode**
- New model `QAMission` (workspace-scoped, indexed by operator/status/score).
  Migration committed at `prisma/migrations/20260520130000_qa_missions/` but
  **not yet applied** — run `npx prisma migrate deploy` before the floating
  panel will work in dev/prod.
- AI mission generator at `POST /api/dev/qa/start` — gated by `DEV_USER_IDS`,
  calls `claude-sonnet-4-6` with a NoBC-specific system prompt that knows
  every operator surface. Returns a scenario + 3-6 steps + optional time
  limit and bonus objective. Falls back to a second attempt on parse failure.
- Tracking APIs:
  - `POST /api/dev/qa/[id]/checkpoint` — marks a step done (auto or manual);
    `skip: true` deducts 10pt instead of awarding.
  - `POST /api/dev/qa/[id]/complete` — closes the mission, computes time bonus
    (½pt per remaining sec) + 25pt full-clear bonus, writes feedback.
  - `POST /api/dev/qa/[id]/bug` — appends bug, +25pt each.
  - `POST /api/dev/qa/[id]/abandon` — abandons cleanly without score.
- Read endpoints:
  - `GET /api/dev/qa/active` — rehydrates the in-progress mission on page load.
  - `GET /api/dev/qa/leaderboard` — top 5 completed this week, workspace-wide.
  - `GET /api/dev/qa/recent` — last 5 missions for this operator.
  - `GET /api/dev/qa/bugs` — flattened bugs across all missions for the
    Settings → Bug Reports list.
- DevToolbar additions in `app/operator/_components/DevToolbar.tsx`:
  - "🎮 QA Game Mode" section with difficulty selector + start button.
  - Weekly leaderboard (top 5) + recent runs list.
  - Post-mission completion card with score + bonuses.
- New floating panel `app/operator/_components/QAMissionPanel.tsx` —
  bottom-left, 360px, separate from the dev toolbar. Step checklist, running
  timer, score in corner, bug button, skip button (with confirm), abandon,
  complete (gated on all steps done). Auto-detects step completion when the
  pathname matches `visit:<path>` or `visit:<path>/*` checkpoints; falls back
  to "Mark done" for `manual:` checkpoints.
- New settings tab "Bug Reports" at `/operator/settings/bug-reports` — list
  view with timestamp, operator, mission type, location, description.
- Shared types in `lib/dev/qa-types.ts` (mission shape + `matchCheckpoint()`
  helper).

## Known gaps
- **Migration not applied.** `QAMission` + earlier
  `OperatorComment` / `OperatorNotification` tables exist in schema + migration
  files but not in the live DB. Run `npx prisma migrate deploy` against Neon
  before shipping.
- The mission generator uses `claude-sonnet-4-6` for parity with the dev
  persona runner. CLAUDE.md locks `claude-sonnet-4-20250514` for application
  scoring specifically — this is a separate dev surface.
- Bug reports page is unscoped by role; matches the rest of the operator UI
  (workspace-scoped, Clerk-authenticated). RBAC remains in the backlog.

## Blocked
- Apple/Google Wallet passes — PassNinja account pending.
- MCP server toolset incomplete.

## Next session
Apply migrations. Smoke-test QA Game Mode:
- Open dev panel (⌘⇧⌥D), pick Easy, click "Start Mission" — confirm panel
  docks bottom-left with steps + timer.
- Navigate to a URL matching a `visit:` checkpoint — confirm auto-completion.
- Click "🐛 Found a bug" — submit, confirm +25pt + entry in
  Settings → Bug Reports.
- Complete the mission — confirm score lands in weekly leaderboard and
  Recent list updates.
- Then deploy.
