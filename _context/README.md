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

## The `nobc-icm` skill

The methodology and template for writing `CONTEXT.md` files lives in the `nobc-icm` skill. Read it before creating a new stage or refactoring an existing one.
