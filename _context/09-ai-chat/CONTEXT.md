# Stage 09 — AI Chat Panel

> Operator-facing AI chat. Plain-English (or voice) command interface that calls the Runtype master agent, which orchestrates across MCPs (NoBC OS, Tenur, Producer).

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #18 |
| **Last updated** | 2026-05-20 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | V1.5 refactor — currently uses Vercel AI SDK direct; route through Runtype master agent |

## Scope

The operator's primary AI surface inside NoBC OS:
- Chat UI in the operator dashboard (panel or dedicated route)
- Voice input (mic button → speech-to-text → command)
- Streaming response display
- Tool-use visualization (when the agent calls an MCP tool, surface what + why)
- Conversation history per operator
- Suggested commands / quick actions

This stage owns the **UI and the proxy to Runtype**. It does **not** own:
- The Runtype master agent configuration itself (that lives in Runtype's editor)
- The MCP server tools (stage 08)

## Files in play

```
app/operator/chat/page.tsx                      ← dedicated chat route
components/operator/ChatPanel.tsx               ← reusable side-panel chat
components/operator/VoiceInput.tsx              ← mic + STT
components/operator/ToolUseDisplay.tsx          ← show MCP tool calls inline
app/api/agent/route.ts                          ← POST to model (currently Vercel AI SDK), stream SSE
app/api/agent/conversations/route.ts            ← list/create AgentConversation
app/api/agent/conversations/[id]/route.ts       ← read/append AgentTurn rows
lib/runtype/client.ts                           ← Runtype API client (V1.5 target)
lib/runtype/sse.ts                              ← SSE stream handling
```

## Inputs

- Operator typing or speaking a command
- Past conversation history (for context)
- Workspace context (current event being viewed, current member, etc.) — passed as agent context

## Outputs

- Streaming response in the chat UI
- MCP tool calls executed via Runtype → stage 08 (NoBC OS MCP) and others
- `AgentConversation` rows + `AgentTurn` rows (turns are stored relationally on the conversation, not as a separate `Message` model)
- `AuditEvent` rows for any platform actions taken

## Schema models

- **AgentConversation**: workspaceId, operatorId, title, lastTurnAt
- **AgentTurn**: agentConversationId, role (`user | assistant | tool`), content, toolCalls (JSON), createdAt
  (Turns are stored on `AgentConversation`. There is no standalone `Message` model — historic references should be read as `AgentTurn`.)

## Rules — DO NOT VIOLATE

1. **Current implementation uses Vercel AI SDK directly via `@ai-sdk/anthropic`.** V1.5 refactor target is routing through the Runtype master agent. Until that refactor, direct Vercel AI SDK calls are acceptable but new features should be designed to be Runtype-compatible (workspace-scoped context, tool-use visibility, SSE streaming). Direct Anthropic calls for tagging/scoring still belong to their feature stage (e.g., stage 01's archetype scoring, stage 12's insight narration).
2. **Pass workspace context to every Runtype call.** The agent must never operate outside the operator's workspace.
3. **Workspace-scoped OAuth tokens for MCP access.** Runtype receives short-lived tokens (1-hour TTL); never long-lived credentials.
4. **Stream responses via SSE.** Block-and-wait responses are unacceptable UX.
5. **Tool-use is visible to the operator.** When the agent calls `applications.approve`, the chat shows "approving application X" with the actual tool call. No hidden side effects.
6. **Voice input is opt-in.** Don't auto-enable the mic.

## Environment variables

- `RUNTYPE_API_URL` — Runtype's API base
- `RUNTYPE_API_KEY` — workspace's Runtype token (encrypted at rest)

## What this stage does NOT own

- The Runtype master agent itself → managed in Runtype editor (Nathan / Adam)
- The MCP tool definitions → `08-mcp-server/`
- The AI Event Builder (specialized agent flow) → `10-ai-event-builder/`
- Application archetype scoring (direct Anthropic call) → `01-apply/`
- SMS / House Phone trigger → `11-producer-integration/`
