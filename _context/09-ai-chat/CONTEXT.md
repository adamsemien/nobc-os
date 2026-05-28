# Stage 09 — AI Chat Panel

> **Shipped: native Vercel AI SDK + the in-app `lib/agent/` tool registry. Runtype was evaluated as the future agent runtime and scratched; no replacement runtime is planned today.**

> Operator-facing AI chat. Plain-English command interface mounted on every operator page. It calls Anthropic directly through the Vercel AI SDK (`@ai-sdk/anthropic` + `streamText`) and drives platform actions via the in-process **`lib/agent/` tool registry** — its own catalog, distinct from the remote MCP surface in stage 08. This is the long-term architecture. Runtype was the earlier-planned orchestrator across MCPs (NoBC OS, Tenur, Producer) and has been scratched; if a multi-MCP orchestrator is ever needed, it will be a different runtime TBD.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #18 |
| **Last updated** | 2026-05-21 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | Close the `lib/agent/` vs `lib/mcp/` tool-coverage gap so the in-app chat reaches parity with the MCP surface: event writes (create/update/publish/cancel), member tagging, red list, ticketing tiers, and event series. RSVP + check-in tools have landed. Consolidating onto one catalog (instead of two parallel registries) is the larger follow-up; Runtype is not the plan for that. |

## Scope

The operator's primary AI surface inside NoBC OS:
- Chat UI in the operator dashboard — a slide-over panel mounted globally in the operator layout
- Streaming response display (SSE)
- Tool-use visualization (when the agent calls a tool, the panel surfaces what + why inline)
- Human-in-the-loop confirmation cards for destructive / write tools
- Conversation history per operator (persisted relationally)
- Suggested commands / quick actions

This stage owns the **chat UI and the agent API** — direct Vercel AI SDK + the `lib/agent/` tool registry. It does **not** own:
- The remote MCP server + its tool definitions (stage 08, `lib/mcp/`)
- The AI Event Builder specialized flow (stage 10) — exposed here only as the `/api/agent/event-builder` route

> **Voice input is deferred** — not built in Phase 1. The mic / speech-to-text affordance from the original scope is V1.5.

## Files in play

```
app/operator/_components/AgentPanel.tsx     ← shipped slide-over chat UI; launcher FAB + ⌘⇧⌥A toggle
app/operator/layout.tsx                     ← mounts <AgentPanel /> on every operator page
app/api/agent/route.ts                      ← POST: auth + rate-limit, persist USER turn, stream the assistant turn (SSE)
app/api/agent/confirm/route.ts              ← resume a confirmation-gated write tool after operator approval
app/api/agent/cancel/route.ts               ← cancel an in-flight / awaiting-confirmation turn
app/api/agent/event-builder/route.ts        ← specialized AI event-builder flow (stage 10 consumer)
lib/agent/system-prompt.ts                  ← AGENT_MODEL (claude-sonnet-4-20250514) + AGENT_SYSTEM_PROMPT
lib/agent/lib/loop.ts                       ← streamAgentTurn: streamText loop, stepCountIs(8), SSE events, turn persistence
lib/agent/lib/streaming.ts                  ← SSE encode helpers
lib/agent/lib/rate-limit.ts                 ← per-workspace agent rate limit (429)
lib/agent/lib/spotlight.ts                  ← workspace-context / spotlight helpers
lib/agent/registry.ts                       ← tool registry: boot-time workspace-scope guard, buildToolSet, executeTool (audit), confirmation gating
lib/agent/types.ts                          ← AgentToolContext, AnyAgentTool
lib/agent/tools/index.ts                    ← side-effect imports that register every Phase 1 tool
lib/agent/tools/{applications,members,events,rsvps,checkin,intelligence,emails,audit}/*  ← 25 registered tools
```

> **Note on `lib/mcp/` (stage 08):** the in-app chat does **not** import `lib/mcp/`. `lib/mcp/` is the *remote* MCP surface (JSON-RPC at `/api/mcp`) for external clients (Claude Desktop today; future SaaS integrators tomorrow). These are two parallel registries with overlapping but non-identical tool coverage. Consolidating onto one catalog is a follow-up — Runtype was scratched and is not the path.

## Tool coverage (`lib/agent/tools/*`)

Reads run un-gated (no confirmation, no audit). Writes pause for operator confirmation in the panel and emit an `AuditEvent` (`actorType=AGENT`) via the registry.

| Group | Reads | Writes (confirmation + audit) |
|---|---|---|
| applications | `find`, `get` | `approve`, `reject`, `waitlist`, `move_to_hold` |
| members | `find`, `get`, `search` | — |
| events | `find`, `get`, `list` | — |
| rsvps | `list`, `get` | `approve`, `reject`, `promote`, `comp_ticket` |
| checkin | `status`, `lookup` | `checkin` |
| intelligence | `run_metric`, `compose` | — |
| emails | — | `send_custom` |
| audit | `search` | — |

> RSVP/check-in tools (added for live-event questions) cover the guest list, approval-gated access, waitlist promotion, and door check-in. `checkin.status`/`checkin.lookup` are reads (no confirmation) so "how many are here?" / "is X here?" answer instantly; only `checkin.checkin` and the RSVP writes gate. This closes the demo-critical gaps where the chat agent previously could not read RSVPs or run the door.

## Inputs

- Operator typing a command in the panel
- Past conversation history (rebuilt from `AgentTurn` rows for context)
- Workspace context (current event / member being viewed) — passed as agent context

## Outputs

- Streaming response in the chat UI (SSE: thread / text / tool_call / tool_result / tool_error / confirmation_required / error / done)
- Tool calls — executed in-process via the `lib/agent/` registry (long-term architecture; Runtype was scratched)
- `AgentConversation` rows + `AgentTurn` rows (turns are stored relationally on the conversation, not as a separate `Message` model)
- `AuditEvent` rows (`actorType = AGENT`) for any write tool the agent runs

## Schema models

- **AgentConversation**: workspaceId, operatorId, title, lastTurnAt
- **AgentTurn**: agentConversationId, role (`user | assistant | tool`), content, toolCalls (JSON), createdAt
  (Turns are stored on `AgentConversation`. There is no standalone `Message` model — historic references should be read as `AgentTurn`.)

## Rules — DO NOT VIOLATE

1. **The implementation uses the Vercel AI SDK directly via `@ai-sdk/anthropic`** through `lib/agent/lib/loop.ts`. Model is `claude-sonnet-4-20250514` (`AGENT_MODEL` in `lib/agent/system-prompt.ts`) — never substitute, upgrade, or downgrade. This is the long-term architecture; Runtype was the earlier-planned orchestrator and has been scratched. New features should stay workspace-scoped, surface tool-use visibly, and stream via SSE.
2. **Every agent/tool call is workspace-scoped.** `lib/agent/registry.ts` refuses at boot to register any tool whose handler never references `workspaceId`. The agent must never operate outside the operator's workspace.
3. **Write tools emit an `AuditEvent` with `actorType = AGENT`.** Read tools skip audit. Distinguishes agent actions from operator actions for traceability.
4. **Destructive / write tools require operator confirmation.** Confirmation-required tools register without an `execute`, so the loop pauses and emits `confirmation_required`; the panel renders a Confirm/Cancel card and `/api/agent/confirm` resumes the run. No hidden side effects.
5. **Stream responses via SSE.** Block-and-wait responses are unacceptable UX.
6. **Tool-use is visible to the operator.** When the agent calls a tool, the chat surfaces the call and its result inline.
7. **If any future external client ever calls the stage-08 MCP server over HTTP, it must use workspace-scoped short-lived tokens (1-hour TTL).** Never long-lived credentials. The in-app chat runs tools in-process, so no token is involved today.

## Environment variables

The shared `ANTHROPIC_API_KEY` (Vercel AI SDK) is the only env var this stage needs. The historical `RUNTYPE_API_URL` / `RUNTYPE_API_KEY` placeholders were removed from `.env.local` when Runtype was scratched and never appeared in code; do not reintroduce them.

## What this stage does NOT own

- Any external agent runtime → none today; Runtype was scratched
- The remote MCP tool definitions → `08-mcp-server/` (`lib/mcp/`)
- The AI Event Builder (specialized agent flow) → `10-ai-event-builder/`
- Application archetype scoring (direct Anthropic call) → `01-apply/`
- SMS / House Phone trigger → `11-producer-integration/`
