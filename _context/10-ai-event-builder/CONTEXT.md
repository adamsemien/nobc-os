# Stage 10 — AI Event Builder

> Multi-stage AI-assisted event creation flow. Operator describes an event in plain English; agent intakes, enriches, drafts, surfaces for review, publishes on approval.

## Status

| Field | Value |
|---|---|
| **State** | 🔶 Partial — **v1 (Phases 1–3) built on `feat/ai-event-builder`, unmerged, pending review** |
| **V1 item** | #19 |
| **Last updated** | 2026-06-04 |
| **Owner** | Adam |
| **Blocked on** | Nothing (awaiting review + merge of `feat/ai-event-builder`) |
| **Next** | Review + merge `feat/ai-event-builder`. Then optional Phase 4 (per-event `EventSponsor` join — none exists today; v1 only notes the sponsor name) and Phase 5 polish (`EventDraft` save/resume, an "AI draft" badge in the event list, `AgentPanel`-style slide-over trigger). |

> **v1 reality (2026-06-04, `feat/ai-event-builder`, Phases 1–3).** Shipped the smallest useful version: natural language → reviewable draft, committed only on explicit operator action. **Approach diverges from the original 5-stage / MCP-write design below**, deliberately and more safely:
> - **One `generateObject` call** (`app/api/agent/event-builder`, STAFF-gated, `claude-sonnet-4-20250514`) returns a zod-validated `EventDraft` (event fields + optional `ticketTiers[]` + `announcementDraft` + `sponsorName`). The model **writes nothing to the DB and registers no tools**; there is no `status` field, so it can never publish.
> - **Review surface is the existing `/operator/events/new` multi-step form** (not new `events/new/ai/*` pages), with an "AI draft — review before publishing" banner; every field editable.
> - **Writes go through the existing gated REST create routes** — `POST /api/operator/events`, then `POST /api/operator/ticket-tiers` per tier, then `POST /api/operator/comments` for the announcement draft — **not** MCP tools. This satisfies the "human gate / model never writes" intent of Rules 1–2 via a different (simpler) path than Rule 2's literal "MCP tools" wording. Update Rule 2 if this becomes the permanent design.
> - Sponsor is a **note only** (no `EventSponsor` model). Announcement is **stored as a draft event comment, never sent** (no member-broadcast channel exists; v1 builds none).
> - Deleted the dead, ungated public duplicate `app/api/ai/event-builder/route.ts` (no callers).
> - Not built in v1: the "AI draft" badge in the event list (Rule 5), `EventDraft` persistence, rewind-between-stages (Rule 4 — the form's step nav covers editing). Zero schema change.

## Scope

A specialized agent flow for operator-led event creation. Originally planned as a Runtype sub-agent; Runtype has been scratched, so the runtime is the in-app `lib/agent/` (Stage 09) with this stage's prompt contracts layered on top. Follows ICM principles internally — five sequential stages, human review gate before publish:

```
Stage A — Intake         "What's the event? Date, vibe, access mode, capacity"
Stage B — Enrichment     Pull past events from series, sponsor profile match, suggest tier
Stage C — Draft          Generate event page copy, tags, suggested invite list segments
Stage D — Review gate    ← human (operator) reviews, edits, approves
Stage E — Publish        Write to DB via MCP tools, fire Phase J webhook
```

This stage owns the **UI for the event builder flow** and the **agent prompt contracts**. The agent runs in-process through Stage 09's `lib/agent/` runtime (Runtype was scratched).

## Files in play

```
app/api/agent/event-builder/route.ts            ← v1 generator: single generateObject → zod EventDraft (event + tiers + announcement + sponsorName), STAFF-gated, no DB writes, no tools
app/operator/events/new/page.tsx                 ← v1 review + commit UI: AI prompt → editable draft (banner, tier cards, announcement) → existing create routes

# Committed-through (existing, unchanged) routes:
#   POST /api/operator/events         ← event create (STAFF, zod, txn, audit)
#   POST /api/operator/ticket-tiers   ← per-tier create (STAFF)
#   POST /api/operator/comments       ← announcement saved as a draft event comment (STAFF)

# Deleted in v1: app/api/ai/event-builder/route.ts (dead, ungated public duplicate, no callers)

# Deferred (Phases 4–5, NOT built):
# EventSponsor model + sponsor matching · EventDraft persistence · "AI draft" badge in event list · slide-over trigger
```

## Inputs

- Operator's plain-English description of the event
- Optional: previous event in the same series (for tone/format reference)
- Workspace's sponsor profiles + member archetype distribution

## Outputs

- Draft `Event` row (status: `draft`) on stage C
- Published `Event` on stage E (status: `published`)
- Phase J webhook fired → stage 11
- `AuditEvent` rows for each stage transition

## Rules — DO NOT VIOLATE

1. **Human approval gate is mandatory.** No auto-publish path. Operator must confirm at stage D.
2. **All writes go through MCP tools, not direct DB.** The event builder calls `events.create`, `events.update`, `events.publish` via stage 08. Founding principle #2 enforced.
3. **Each stage's prompt has a defined contract.** Inputs and outputs are typed and predictable. Document them in `lib/event-builder/prompts/`.
4. **Operator can rewind and edit at any stage.** Going from D back to C is supported. The flow is not a one-way pipeline.
5. **Draft events are visible in the operator event list with a clear "AI draft" badge.** Don't hide them from the regular events view.
6. **Workspace-scoped throughout.** Sponsor matching, series lookups, segment queries — all scoped to the operator's workspace.

## What this stage does NOT own

- Event schema + the events table → `03-events/`
- The Phase J webhook send → `11-producer-integration/`
- General-purpose AI chat → `09-ai-chat/`
- The MCP tool implementations called by the agent → `08-mcp-server/`
- General-purpose AI chat runtime → `09-ai-chat/` (`lib/agent/`); Runtype was scratched and is no longer the runtime for this stage either
