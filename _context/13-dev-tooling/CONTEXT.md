# Stage 13 — Dev Tooling (QA Missions, Personas, Seed/Reset)

> Internal-only dev surface: the AI QA mission runner with judge verdicts, synthetic persona generator, demo seed + reset, and the apply-flow exerciser. Lets Adam — and eventually any operator on a dev workspace — drive realistic data through every other stage on demand.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped (internal tooling) |
| **V1 item** | — (internal, not in the V1 customer-facing scope table) |
| **Last updated** | 2026-05-30 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | **2026-05-30: Easter-egg fixes.** (1) **Konami listener made global** — moved the `↑↑↓↓←→←→BA` listener out of `ApplicationsQueue.tsx` (where it only fired on `/operator/applications`) into a new `app/operator/_components/KonamiEasterEgg.tsx` mounted in `app/operator/layout.tsx` alongside the other egg components. Same Void-theme gate (`data-theme === 'void'`), same 3-second white-out flash (the overlay render + `voidInverted` state moved into the new component; all three pieces removed from `ApplicationsQueue`). Now listenable on any operator page. (2) **DevToolbar egg labels rewritten** — `EASTER_EGGS` changed from `{trigger,desc}` to `string[]`, each line now states trigger method + effect (e.g. "↑↑↓↓←→←→BA on any page (Void theme) — 3-second white-out flash"; "Switch to AIM theme — away message banner (Settings → Theme)"); render simplified to one plain line per entry (`Kbd` still used by the Shortcuts section). tsc clean. — Iterate QA judge accuracy; expand persona archetype coverage. (2026-05-24: **Vitest unit harness** added — `vitest.config.ts` + `npm run test:unit`; first suite `tests/unit/score-display.test.ts` covers `lib/score-display.ts → toScoreDisplay`. 2026-05-24: **"The Room" demo data** — 18 attendees (12 APPROVED members, 4 guests, 2 waitlisted) + matching RSVPs seeded directly against **The Residency — Summer Edition** via SQL; every row id is `demo_seed_*` with `origin = 'demo_seed'`, fully reversible — see "Demo data" below.) 2026-05-21: demo seed rewritten to emit the live `/apply` form's REAL dotted answer keys (42–43 rows); deterministic archetypeScores retained; verify `tsx scripts/verify-demo-applications.ts` → 30/30. Audit 2026-05-21: seed creates no today-event (hides "The Room" button) and dev-route checked-in members lack Applications (blanks archetype chips) — see Audit findings below. **2026-05-27, PR #33:** the DevToolbar is now also openable from **Settings → Developer** — `OpenDevToolbarButton` (client) writes the open flag to localStorage + dispatches `DEV_TOOLBAR_OPEN_EVENT`, which the toolbar listens for; the Settings entry is gated server-side by `DEV_USER_IDS`. **2026-05-27, PR #36:** added a **Shortcuts** cheat-sheet section to the DevToolbar — Global / Applications-queue keys, Easter eggs, and The Room flourishes, with styled `<kbd>` keys (reference-only, no new behavior). **2026-05-27, PR #35:** removed unimplemented keyboard shortcuts from the in-app help copy so it matches reality. **2026-05-28, PR #32:** demo-media seed — `scripts/seed-dam.ts` (Pexels, 14 photos + 3 videos) wired into the DevToolbar as **"Seed Demo Media"** (`POST /api/dev/seed-dam`). **2026-05-28, PR #37:** **"Clear Demo Media"** button in the DevToolbar (`DELETE /api/dev/seed-dam`) — wipes seed assets + R2 objects + seed folders. |

## Scope

- **QA Missions** — operator-facing scripted scenarios (speed_run, discovery, workflow, stress_test, bug_hunt). Each step posts a checkpoint; the AI judge evaluates pass/partial/fail using an action log captured client-side. Bugs filed mid-mission attach to the active step. Summary export renders verdict badges per step.
- **Persona generator** — synthetic-but-realistic applicants and members, batched into seed runs and individual generations, used to populate dev workspaces.
- **Seed + reset** — one-click demo dataset rebuild for the active workspace (applications, events, members, RSVPs, Founder's Circle, etc.) and corresponding teardown.
- **Apply-flow tester** — programmatic exercise of the `/apply` submit path including AI archetype scoring.
- **Unit test harness** — Vitest (`vitest.config.ts`, `npm run test:unit`) for pure-function coverage; first suite is `tests/unit/score-display.test.ts`.

All `/api/dev/*` routes here are gated by `DEV_USER_IDS` (allow-list of Clerk userIds) and must never be reachable on a customer workspace. (The Vitest harness is local/CI only — not a route.)

## Files in play

```
app/api/dev/qa/start/route.ts                       ← create a QAMission with target steps
app/api/dev/qa/active/route.ts                      ← list active missions for an operator
app/api/dev/qa/recent/route.ts                      ← recent missions (for resume)
app/api/dev/qa/leaderboard/route.ts                 ← multi-operator standings
app/api/dev/qa/custom/route.ts                      ← custom scenario builder
app/api/dev/qa/bugs/route.ts                        ← global bug feed across missions
app/api/dev/qa/judge/route.ts                       ← Claude Sonnet judge (verdict + reason)
app/api/dev/qa/[id]/checkpoint/route.ts             ← step pass / advance + verdict persistence
app/api/dev/qa/[id]/complete/route.ts               ← mark mission complete
app/api/dev/qa/[id]/abandon/route.ts               ← mark mission abandoned
app/api/dev/qa/[id]/bug/route.ts                    ← file bug on current step
app/api/dev/qa/[id]/summary/route.ts                ← markdown mission summary with badges
app/api/dev/persona/seed-batch/route.ts             ← generate N personas as a batch
app/api/dev/persona/generate/route.ts               ← generate one persona
app/api/dev/persona/run/route.ts                    ← run a persona through /apply
app/api/dev/seed/route.ts                           ← rebuild demo workspace dataset (uses shared demo-applications)
app/api/dev/reset/route.ts                          ← teardown demo dataset
app/api/dev/seed-dam/route.ts                       ← POST — seed demo media (PR #32) / DELETE — clear dam-seed demo media (PR #37, assets + R2 objects + seed folders)
scripts/seed-dam.ts                                 ← Pexels demo media: 14 photos + 3 videos (called by POST /api/dev/seed-dam)
app/api/dev/test-apply-flow/route.ts                ← programmatic /apply exerciser
app/operator/_components/QAMissionPanel.tsx        ← floating mission HUD + per-step bug + judge flash
app/operator/_components/DevToolbar.tsx             ← dev pill + tool launcher; exports DEV_TOOLBAR_OPEN_EVENT + listens for it (external open); now includes Shortcuts cheat-sheet section (PR #36) + Seed Demo Media (PR #32) + Clear Demo Media (PR #37) buttons
app/operator/settings/OpenDevToolbarButton.tsx     ← Settings → Developer launcher (dev-gated): opens the DevToolbar via localStorage flag + CustomEvent (PR #33)
lib/dev/qa-action-log.ts                            ← CustomEvent ring buffer for judge context
lib/dev/qa-types.ts                                 ← JudgeVerdict, CompletedStep types
lib/dev/persona-types.ts                            ← persona schema for generator
lib/dev/demo-applications.ts                        ← shared demo-app content: full answer set + 0–100 archetypeScores + wipe/seed helpers
prisma/seed-demo.ts                                 ← `npm run seed:demo` — Tenur-call demo (members, events, RSVPs, complete applications)
scripts/verify-demo-applications.ts                 ← read-only check: every demo app has full answers + AI profile
scripts/survey-non-demo-data.ts                     ← read-only inventory of non-demo rows in the NoBC workspace
scripts/cleanup-non-demo-data.ts                    ← deletes ALL non-demo data (apps/members/events + deps), workspace-scoped, dry-run default (--write to execute)
vitest.config.ts                                    ← Vitest config (node env); `npm run test:unit`
tests/unit/score-display.test.ts                    ← unit suite for lib/score-display.ts → toScoreDisplay
```

## Inputs

- Operator userId on the `DEV_USER_IDS` allow-list
- QA scenario request (built-in or custom)
- Persona generation request (batch size, archetype mix)
- Seed/reset trigger from DevToolbar
- Client-side action log entries (navigation + operator actions) feeding the judge

## Outputs

- `QAMission` rows with `completedSteps` JSON capturing verdicts + bugs
- Synthetic `Application` / `Member` rows (when persona+apply-flow paths run)
- Markdown mission summary
- `AuditEvent` rows tagged with `actorType = 'SYSTEM'` for the seed/reset paths

## Schema models

- **QAMission**: workspaceId, operatorId, operatorName, scenario, missionType, difficulty, targetSteps (JSON), completedSteps (JSON; carries `verdict` + `verdictReason` per step), score, bugsFound (JSON), feedback, startedAt, completedAt, durationMs

## Rules — DO NOT VIOLATE

1. **Allow-list every endpoint.** Every `/api/dev/*` route checks `DEV_USER_IDS` from env. A 403 fast-fail is the default branch.
2. **Never run on a customer workspace.** Seed and reset are destructive. The route handler must double-check the workspace is the NoBC dev workspace before touching data.
3. **Judge uses `claude-sonnet-4-6` (dev tooling), not the locked `claude-sonnet-4-20250514`.** This is the deliberate exception to CLAUDE.md's model rule — the application scoring path stays on `claude-sonnet-4-20250514`; dev tooling uses the latest Sonnet for faster iteration on judge prompts.
4. **Server timeout on judge is 4s, client AbortController at 5s, with `{verdict: null}` fallback.** A slow judge must never block step advancement.
5. **Bugs are decoupled from step progression.** Filing a bug on step N records the bug; it does not auto-advance to step N+1. Step auto-advance only fires for the currentStep's URL detector.
6. **Seed data is canonical demo data, not random.** Applicants have stable seeds (e.g. picsum URLs keyed on the email local-part) so screenshots are reproducible across runs. Answer content and archetypeScores are deterministic too (`lib/dev/demo-applications.ts` — index/archetype-derived, no `Math.random`), so re-seeding reproduces identical applications.
7. **No hex literals in QAMissionPanel HUD.** Use semantic tokens; verdict palette (`var(--success)`, `var(--warning)`, `var(--danger)`) only.

## Audit findings — why the demo seed doesn't light up "The Room" (2026-05-21, code-verified, read-only)

"The Room" (per-event live check-in board) is testable from the demo workspace, but two seed gaps hide it. The Room's *query* (`app/api/operator/events/[id]/room/route.ts`) populates fine — it just needs RSVPs with `checkedIn:true`, which the seeds do create in bulk. The blockers are upstream:

**Gap A — no event starts *today* (primary; hides the dashboard button).** The dashboard's only "Open The Room" entry is the "Tonight" band, gated to today-only events (`app/operator/page.tsx:170`; see `07-operator-dashboard`). Every seeded event is strictly past or future:
- `app/api/dev/seed/route.ts`: Residency `weeksFromNow(2)` (`:81`), House Dinner `weeksFromNow(5)`, Founder's `weeksFromNow(8)`, Late Night `daysAgo(21)`, Members Preview `weeksFromNow(3)`.
- `prisma/seed-demo.ts`: No Bad Friday spring `daysAgo(21)` (`:272`), Sunday Selects `daysAgo(7)`, No Bad Friday next `nextSaturday(20)`, Founding Night `weeksFromNow(3)`.

**Gap B — checked-in members have no Application (dev-route only; blanks archetype chips).** In `app/api/dev/seed/route.ts`, checked-in RSVPs belong to `DEMO_MEMBERS`, but Application rows are created only for the disjoint set of PENDING applicants (`seedPendingDemoApplications`, `:419`). The Room's archetype join (`route.ts:79-87`, `archetype:{ not:null }`, matched by email) finds nothing → no chips, empty `archetypeMix`, vibe reads "the room is filling". Names/counts/capacity/waitlist still render. `prisma/seed-demo.ts`'s 10 curated members each get an APPROVED Application with `archetype` (`:209-232`), so they're chip-OK; its 80-person attendee pool is not.

**Smallest fixes (not applied — audit only):**
- *Zero-code (recommended for QA):* skip the dashboard gate — open `/operator/events`, pick an event with live check-ins (dev-route **Residency** = 8 checked in within the last 2 hours + 2 waitlisted → arrival feed, capacity bar, Promote all populate; or **Late Night** / **No Bad Friday spring** fully checked in), click **"The Room →"** in `EventActionBar` (`:53`). Caveat: chips blank on dev-route events (Gap B) — use `seed-demo.ts`'s curated members for chips.
- *Smallest seed change to light the dashboard button + a fully-alive Room:* in `app/api/dev/seed/route.ts:81`, retarget **Residency** `startAt` → today 7pm (`new Date(new Date().setHours(19,0,0,0))`) and adjust `endAt` (`:82`); its 8 existing recent check-ins (`:361-368`) make `todaysEvents` non-empty → button renders + live feed works. To also fix chips, give the 8 checked-in `DEMO_MEMBERS` Application rows carrying their `archetype` (mirror `seed-demo.ts:209-232`), keyed on the same email.

## Demo data — "The Room" seed (2026-05-24, reversible)

To make the live check-in board demo-able, 18 attendees were seeded directly against **The Residency — Summer Edition** (`cmpfs7x3j001g04kwn51z9o44`, workspace `cmpd6xckn000004jl47xpwghx`):

- **12 members** `status = APPROVED` + **4 guests** (`guestName` set) + **2 waitlisted**, each with a matching `RSVP` (16 checked-in, 2 waitlisted).
- **All rows are tagged for clean teardown:** ids are `demo_seed_*` and `origin = 'demo_seed'`. **Only INSERTs — no existing real rows were touched.**
- Inserted via SQL (members first, then RSVPs, in one transaction), idempotent via `ON CONFLICT DO NOTHING`.
- **Reverse with:**
  ```sql
  DELETE FROM "RSVP"    WHERE id LIKE 'demo_seed_%';
  DELETE FROM "Member"  WHERE id LIKE 'demo_seed_%';
  ```

This is distinct from the route/script seeders above (`/api/dev/seed`, `prisma/seed-demo.ts`) — it's a one-off SQL seed for The Room demo, not part of the dev-route rebuild.

## What this stage does NOT own

- The application form itself or the scoring API → `01-apply/`
- The intelligence dashboard the judge may exercise → `12-intelligence/`
- The operator dashboard shell hosting the QA panel + the today-only "Tonight" gate → `07-operator-dashboard/`
- The Room route/query it should populate → `06-wallet-checkin/`
- Production seeding for new customer workspaces (that's a separate, gated path) → not implemented yet
- Twilio or House Phone — this stage never generates SMS traffic, even synthetically
