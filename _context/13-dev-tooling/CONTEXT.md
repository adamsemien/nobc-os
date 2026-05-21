# Stage 13 — Dev Tooling (QA Missions, Personas, Seed/Reset)

> Internal-only dev surface: the AI QA mission runner with judge verdicts, synthetic persona generator, demo seed + reset, and the apply-flow exerciser. Lets Adam — and eventually any operator on a dev workspace — drive realistic data through every other stage on demand.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped (internal tooling) |
| **V1 item** | — (internal, not in the V1 customer-facing scope table) |
| **Last updated** | 2026-05-21 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | Iterate QA judge accuracy; expand persona archetype coverage; polish DevToolbar surface. (2026-05-21: demo applicants made complete + reviewed — full standard answer set, deterministic 0–100 archetypeScores, aiReasoning — via shared `lib/dev/demo-applications.ts`; both `npm run seed:demo` and the dev seed route now wipe-and-reseed cleanly.) |

## Scope

- **QA Missions** — operator-facing scripted scenarios (speed_run, discovery, workflow, stress_test, bug_hunt). Each step posts a checkpoint; the AI judge evaluates pass/partial/fail using an action log captured client-side. Bugs filed mid-mission attach to the active step. Summary export renders verdict badges per step.
- **Persona generator** — synthetic-but-realistic applicants and members, batched into seed runs and individual generations, used to populate dev workspaces.
- **Seed + reset** — one-click demo dataset rebuild for the active workspace (applications, events, members, RSVPs, Founder's Circle, etc.) and corresponding teardown.
- **Apply-flow tester** — programmatic exercise of the `/apply` submit path including AI archetype scoring.

All routes here are gated by `DEV_USER_IDS` (allow-list of Clerk userIds) and must never be reachable on a customer workspace.

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
app/api/dev/test-apply-flow/route.ts                ← programmatic /apply exerciser
app/operator/_components/QAMissionPanel.tsx        ← floating mission HUD + per-step bug + judge flash
app/operator/_components/DevToolbar.tsx             ← dev pill + tool launcher (if present)
lib/dev/qa-action-log.ts                            ← CustomEvent ring buffer for judge context
lib/dev/qa-types.ts                                 ← JudgeVerdict, CompletedStep types
lib/dev/persona-types.ts                            ← persona schema for generator
lib/dev/demo-applications.ts                        ← shared demo-app content: full answer set + 0–100 archetypeScores + wipe/seed helpers
prisma/seed-demo.ts                                 ← `npm run seed:demo` — Tenur-call demo (members, events, RSVPs, complete applications)
scripts/verify-demo-applications.ts                 ← read-only check: every demo app has full answers + AI profile
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

## What this stage does NOT own

- The application form itself or the scoring API → `01-apply/`
- The intelligence dashboard the judge may exercise → `12-intelligence/`
- The operator dashboard shell hosting the QA panel → `07-operator-dashboard/`
- Production seeding for new customer workspaces (that's a separate, gated path) → not implemented yet
- Twilio or House Phone — this stage never generates SMS traffic, even synthetically
