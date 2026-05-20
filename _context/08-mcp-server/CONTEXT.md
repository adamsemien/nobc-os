# Stage 08 — MCP Server

> The NoBC OS MCP server. Exposes every platform action (read + critical write) as an MCP tool so the Runtype master agent can operate the platform end-to-end.

## Status

| Field | Value |
|---|---|
| **State** | ⚪ Not started |
| **V1 item** | #17 |
| **Last updated** | 2026-05-19 |
| **Owner** | Adam |
| **Blocked on** | Stages 02–05 ship first (need the actions to expose as tools) |
| **Next** | Scaffold `/api/mcp` route + OAuth setup |

## Scope

A single MCP server at `nobc.thenobadcompany.com/mcp` (route: `/api/mcp`) that exposes the full tool surface for the platform:
- Application operations (list, read, approve, reject, waitlist)
- Member operations (list, read, edit, tag)
- Event operations (list, read, create, update, publish, cancel)
- RSVP operations (list, read, approve, reject, cancel)
- Payment operations (refund — capture is automated via check-in)
- Wallet pass operations (revoke)
- Audit log queries
- Workspace settings reads

OAuth 2.0 authentication, workspace-scoped tokens.

## Files in play

```
app/api/mcp/route.ts                            ← MCP HTTP handler
app/api/mcp/oauth/authorize/route.ts            ← OAuth authorize
app/api/mcp/oauth/token/route.ts                ← OAuth token exchange
lib/mcp/server.ts                               ← MCP server instance
lib/mcp/tools/applications.ts                   ← application tool definitions
lib/mcp/tools/members.ts                        ← member tool definitions
lib/mcp/tools/events.ts                         ← event tool definitions
lib/mcp/tools/rsvps.ts                          ← RSVP tool definitions
lib/mcp/tools/payments.ts                       ← payment tool definitions
lib/mcp/tools/audit.ts                          ← audit query tools
lib/mcp/auth.ts                                 ← OAuth token validation, workspace scoping
```

## Inputs

- MCP client (Runtype master agent, Claude Desktop, future SaaS integrators)
- OAuth-scoped access tokens (workspace-bound, 1-hour TTL with refresh)

## Outputs

- Tool execution results (JSON)
- Side effects on the platform (writes via the same code paths the UI uses)
- `AuditEvent` rows with `actorType = 'agent'`

## Rules — DO NOT VIOLATE

1. **Every UI action must have a corresponding MCP tool.** Founding principle #2. If you build a button in the operator dashboard that doesn't have an MCP equivalent, the principle is broken.
2. **MCP tools call the same service-layer functions the UI calls.** Do not duplicate business logic. The route handler is thin; logic lives in `lib/`.
3. **OAuth tokens are workspace-scoped.** A token issued for workspace A cannot read or write workspace B's data. Validate on every call.
4. **Agent actions write `AuditEvent` with `actorType = 'agent'`.** Distinguish from operator actions for traceability.
5. **Destructive tools require explicit operator approval.** Refunds, cancellations, member deletions — even via MCP, these must surface a confirmation gate (currently handled by Runtype master agent's human-in-the-loop pattern; document the contract here).
6. **Token TTL is 1 hour with refresh.** Long-lived tokens are not acceptable.

## Tool surface (V1 minimum)

```
applications.list, applications.read, applications.approve, applications.reject, applications.waitlist
members.list, members.read, members.update, members.tag
events.list, events.read, events.create, events.update, events.publish, events.cancel
rsvps.list, rsvps.read, rsvps.approve, rsvps.reject, rsvps.cancel
payments.refund
wallet.revoke
audit.query
workspace.settings.read
```

## What this stage does NOT own

- The Tenur MCP or Producer MCP → external (Tenur team / existing Producer codebase)
- The Runtype master agent that orchestrates across MCPs → `09-ai-chat/` is the consumer; agent config lives in Runtype itself
- Outbound webhooks (Phase J, Svix) → `11-producer-integration/`
