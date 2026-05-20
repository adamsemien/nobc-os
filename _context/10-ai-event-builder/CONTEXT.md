# Stage 10 — AI Event Builder

> Multi-stage AI-assisted event creation flow. Operator describes an event in plain English; agent intakes, enriches, drafts, surfaces for review, publishes on approval.

## Status

| Field | Value |
|---|---|
| **State** | 🔶 Partial |
| **V1 item** | #19 |
| **Last updated** | 2026-05-20 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | Build out the structured EventBuilder/Intake/Enrichment/Draft/Review UI flow (route handlers exist, UI flow incomplete) |

## Scope

A specialized agent flow (within the Runtype master agent or as a Runtype sub-agent) for operator-led event creation. Follows ICM principles internally — five sequential stages, human review gate before publish:

```
Stage A — Intake         "What's the event? Date, vibe, access mode, capacity"
Stage B — Enrichment     Pull past events from series, sponsor profile match, suggest tier
Stage C — Draft          Generate event page copy, tags, suggested invite list segments
Stage D — Review gate    ← human (operator) reviews, edits, approves
Stage E — Publish        Write to DB via MCP tools, fire Phase J webhook
```

This stage owns the **UI for the event builder flow** and the **agent prompt contracts**. The agent itself runs in Runtype.

## Files in play

```
app/operator/events/new/ai/page.tsx             ← AI event builder entry
app/operator/events/new/ai/[sessionId]/page.tsx ← in-progress session
components/operator/EventBuilder/Intake.tsx     ← stage A UI
components/operator/EventBuilder/Enrichment.tsx ← stage B UI
components/operator/EventBuilder/Draft.tsx      ← stage C UI
components/operator/EventBuilder/Review.tsx     ← stage D UI (human gate)
app/api/agent/event-builder/route.ts            ← agent flow proxy
lib/event-builder/prompts/                      ← prompt contracts per stage
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
- Runtype master agent configuration → managed in Runtype editor
