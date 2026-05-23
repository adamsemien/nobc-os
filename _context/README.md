# `_context/` — NoBC OS Stage Routing

This folder is the source of truth for what Claude Code (or any AI agent) loads when working on a specific part of NoBC OS. It implements **Interpretable Context Methodology (ICM)** — each stage has its own scope, files-in-play, rules, and live status.

## How to use it

**When starting a task, tell Claude Code which stage you're working in:**

> "Work in `_context/03-events/`. Add the custom question builder."

Claude Code reads only that stage's `CONTEXT.md` plus the root `CLAUDE.md`. Other stages stay out of the context window.

**When a task spans two stages**, say so explicitly:

> "Work across `_context/04-access/` and `_context/05-payments/`. Access needs to call Stripe authorize."

## The rules

1. **One stage, one job.** If a stage's `CONTEXT.md` is doing two unrelated things, split it.
2. **Status is live.** Update the status block at the top every time you touch a stage. Stale status is worse than no status.
3. **Don't put cross-cutting rules here.** Workspace scoping, schema discipline, the No Twilio rule — those live in root `CLAUDE.md` and apply everywhere.
4. **When a stage ships and locks, move it to `_archive/`.** Keep `_context/` to the active surface area.

## Stages

| # | Folder | What it owns |
|---|---|---|
| 01 | `01-apply/` | Membership application form + AI archetype scoring |
| 02 | `02-approval/` | Operator review → approval → welcome email + Red List / duplicate handling |
| 03 | `03-events/` | Event creation, calendar, detail pages, registration fields, capacity |
| 04 | `04-access/` | Event Access submission, approval-required handling, waitlist auto-promote |
| 05 | `05-payments/` | Stripe authorize/capture/refund, compliance pages, Stripe webhooks |
| 06 | `06-wallet-checkin/` | Apple/Google Wallet passes (PassNinja) + offline check-in PWA |
| 07 | `07-operator-dashboard/` | Operator shell, member directory, audit log, settings |
| 08 | `08-mcp-server/` | NoBC OS MCP server — tool surface for the master agent |
| 09 | `09-ai-chat/` | Operator AI chat panel (Runtype proxy in V1.5) |
| 10 | `10-ai-event-builder/` | AI-assisted event creation flow |
| 11 | `11-producer-integration/` | Phase J webhook + Svix outbound + House Phone trigger (V1.5) |
| 12 | `12-intelligence/` | Intelligence metric registry + sponsor-facing surface (moat product) |
| 13 | `13-dev-tooling/` | Internal-only: QA Missions, persona generator, seed/reset, apply-flow tester |
| 14 | `14-house-phone/` | Shared multi-operator SMS inbox for live events (outbound replies via Twilio; inbound on Railway) |

## The `nobc-icm` skill

The methodology and template for writing `CONTEXT.md` files lives in the `nobc-icm` skill. Read it before creating a new stage or refactoring an existing one.
