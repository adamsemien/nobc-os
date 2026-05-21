# Stage 09 — AI Chat Panel

> **Phase 1 (current): native Vercel AI SDK + direct `lib/mcp/` tool imports. Runtype master agent wiring is V1.5.**

> Operator-facing AI chat. Plain-English (or voice) command interface. In **Phase 1** it calls Anthropic directly through the Vercel AI SDK and drives platform actions via the NoBC OS MCP tool registry (`lib/mcp/`), imported in-process. In **V1.5** it routes through the Runtype master agent, which orchestrates across MCPs (NoBC OS, Tenur, Producer).

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #18 |
| **Last updated** | 2026-05-21 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | V1.5 refactor — Phase 1 uses Vercel AI SDK direct + `lib/mcp/` tool registry; route through the Runtype master agent in V1.5 |

## Scope

The operator's primary AI surface inside NoBC OS:
- Chat UI in the operator dashboard (panel or dedicated route)
- Voice input (mic button → speech-to-text → command)
- Streaming response display
- Tool-use visualization (when the agent calls an MCP tool, surface what + why)
- Conversation history per operator
- Suggested commands / quick actions

This stage owns the **chat UI and the agent API** — Phase 1: direct Vercel AI SDK + the `lib/mcp/` tool registry; V1.5: a proxy to Runtype. It does **not** own:
- The Runtype master agent configuration itself (V1.5; lives in Runtype's editor)
- The MCP server tools (stage 08)

## Files in play

```
app/operator/chat/page.tsx                      ← dedicated chat route
components/operator/ChatPanel.tsx               ← reusable side-panel chat
components/operator/VoiceInput.tsx              ← mic + STT
components/operator/ToolUseDisplay.tsx          ← show MCP tool calls inline
app/api/agent/route.ts                          ← Phase 1: POST to model via Vercel AI SDK + lib/mcp/ tools, stream SSE
app/api/agent/conversations/route.ts            ← list/create AgentConversation
app/api/agent/conversations/[id]/route.ts       ← read/append AgentTurn rows
lib/mcp/                                         ← Phase 1 tool surface (imported in-process; see stage 08)
# lib/runtype/client.ts                          ← V1.5 only — Runtype API client (not yet created)
# lib/runtype/sse.ts                             ← V1.5 only — SSE stream handling (not yet created)
```

## Inputs

- Operator typing or speaking a command
- Past conversation history (for context)
- Workspace context (current event being viewed, current member, etc.) — passed as agent context

## Outputs

- Streaming response in the chat UI
- MCP tool calls — Phase 1: executed in-process via the `lib/mcp/` registry (stage 08); V1.5: routed through Runtype to stage 08 and other MCPs
- `AgentConversation` rows + `AgentTurn` rows (turns are stored relationally on the conversation, not as a separate `Message` model)
- `AuditEvent` rows for any platform actions taken

## Schema models

- **AgentConversation**: workspaceId, operatorId, title, lastTurnAt
- **AgentTurn**: agentConversationId, role (`user | assistant | tool`), content, toolCalls (JSON), createdAt
  (Turns are stored on `AgentConversation`. There is no standalone `Message` model — historic references should be read as `AgentTurn`.)

## Rules — DO NOT VIOLATE

1. **Current implementation uses Vercel AI SDK directly via `@ai-sdk/anthropic`.** V1.5 refactor target is routing through the Runtype master agent. Until that refactor, direct Vercel AI SDK calls are acceptable but new features should be designed to be Runtype-compatible (workspace-scoped context, tool-use visibility, SSE streaming). Direct Anthropic calls for tagging/scoring still belong to their feature stage (e.g., stage 01's archetype scoring, stage 12's insight narration).
2. **Pass workspace context to every agent/tool call.** The agent must never operate outside the operator's workspace — true for Phase 1 `lib/mcp/` calls and V1.5 Runtype calls alike.
3. **(V1.5) Workspace-scoped OAuth tokens for MCP access over HTTP.** When Runtype calls the MCP server remotely it receives short-lived tokens (1-hour TTL); never long-lived credentials. (Phase 1 imports `lib/mcp/` in-process, so no token is involved.)
4. **Stream responses via SSE.** Block-and-wait responses are unacceptable UX.
5. **Tool-use is visible to the operator.** When the agent calls `applications.approve`, the chat shows "approving application X" with the actual tool call. No hidden side effects.
6. **Voice input is opt-in.** Don't auto-enable the mic.

## Environment variables

Phase 1 needs none beyond the shared `ANTHROPIC_API_KEY` (Vercel AI SDK). The following are **V1.5 only** (not set today — `RUNTYPE_API_URL` was removed from `.env.local` as dead config):

- `RUNTYPE_API_URL` — Runtype's API base (V1.5)
- `RUNTYPE_API_KEY` — workspace's Runtype token, encrypted at rest (V1.5)

## What this stage does NOT own

- The Runtype master agent itself → managed in Runtype editor (Nathan / Adam)
- The MCP tool definitions → `08-mcp-server/`
- The AI Event Builder (specialized agent flow) → `10-ai-event-builder/`
- Application archetype scoring (direct Anthropic call) → `01-apply/`
- SMS / House Phone trigger → `11-producer-integration/`
