# Stage 08 — MCP Server

> The NoBC OS MCP server. Exposes every platform action (read + critical write) as an MCP tool so the Runtype master agent can operate the platform end-to-end.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped (V1) |
| **V1 item** | #17 |
| **Last updated** | 2026-05-25 |
| **Owner** | Adam |
| **Blocked on** | Authorization: `/api/mcp` is gated by Clerk auth + workspace ONLY, no operator role — any user in the workspace's Clerk org can call every write tool. The RBAC helper now exists as of 2026-05-25 (`lib/operator-role.ts` / `requireRole`, PR #5 — see `07-operator-dashboard`), but the MCP write path was **not** included in the first coverage pass; gating it is now a wiring task, not a missing-helper one. |
| **Next** | Gate the MCP write tools with `requireRole` (helper now shipped, PR #5). Wire the Runtype master agent to the live `/api/mcp` endpoint. Add `payments.refund` + `wallet.revoke` tools once Stripe capture / wallet revocation land. Extract approve/checkin write logic into a shared service layer (currently lives in the tool modules). |

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

**Auth (V1, shipped):** bearer-token, verified with **Clerk's backend SDK** (`@clerk/backend` `verifyToken`). Every request must carry `Authorization: Bearer <Clerk session token>`; an active Clerk browser session is also accepted as a fallback (in-app / Claude Desktop). The **workspace is derived from the authenticated identity** (`requireWorkspaceId`), never from the request body — that is the cross-tenant boundary. Unauthenticated / invalid-token requests get `401` + `WWW-Authenticate: Bearer`. (This supersedes the earlier custom OAuth-2.0 `authorize`/`token` sketch — Clerk owns identity, so a parallel OAuth server is unnecessary for V1. A standalone OAuth surface for non-Clerk integrators is a V1.5 option.)

**Protocol (V1, shipped):** Model Context Protocol over **JSON-RPC 2.0** (Streamable HTTP, stateless) at `POST /api/mcp` — methods `initialize`, `tools/list`, `tools/call`, `ping`, and `notifications/*`. `GET /api/mcp` returns a JSON manifest of the authenticated tool surface. Tool input contracts are Zod schemas surfaced to clients as JSON Schema.

## Files in play

```
app/api/mcp/route.ts            ← thin JSON-RPC entry: auth-gate → dispatch (POST) + manifest (GET)
lib/mcp/auth.ts                 ← bearer (Clerk verifyToken) + session fallback → { userId, workspaceId }
lib/mcp/types.ts                ← McpContext, McpTool
lib/mcp/server.ts               ← JSON-RPC dispatcher (initialize / tools.list / tools.call / ping)
lib/mcp/registry.ts             ← aggregates all tools; Zod→JSON-Schema; validate + call
lib/mcp/tools/members.ts        ← nobc_get_members, nobc_get_member, nobc_tag_member
lib/mcp/tools/applications.ts   ← nobc_get_applications, nobc_get_application, approve / reject / waitlist
lib/mcp/tools/events.ts         ← nobc_get_events, nobc_get_event, create / update / publish / cancel
lib/mcp/tools/rsvps.ts          ← nobc_get_rsvps, nobc_get_rsvp, approve / reject / cancel
lib/mcp/tools/checkin.ts        ← nobc_get_checkin_status, nobc_check_in
lib/mcp/legacy-tools.ts         ← preserved surface: intelligence.* (auto-registered), ticketing.*, series.*, tag.*, comp/redlist/waitlist
```

### V1 tool surface (shipped)

```
Reads:  nobc_get_members, nobc_get_member, nobc_get_applications, nobc_get_application,
        nobc_get_events, nobc_get_event, nobc_get_rsvps, nobc_get_rsvp, nobc_get_checkin_status
Writes: nobc_tag_member, nobc_approve_application, nobc_reject_application, nobc_waitlist_application,
        nobc_create_event, nobc_update_event, nobc_publish_event, nobc_cancel_event,
        nobc_approve_rsvp, nobc_reject_rsvp, nobc_cancel_rsvp, nobc_check_in
Plus:   intelligence.* (every mcpExposed metric + intelligence.compose), ticketing.tier.*,
        series.*, tag.*, issue_comp_ticket, promote_from_waitlist, add_to_red_list
```

Every write tool sets `destructive: true` (surfaced to clients as `destructiveHint`) and writes an `AuditEvent` with `actorType = 'AGENT'`.

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

## Audit findings — authorization (2026-05-21, code-verified, read-only)

`app/api/mcp/route.ts` → `lib/mcp/auth.ts:21-32` verifies a Clerk bearer token / session → `userId` → `requireWorkspaceId` (`:26`). That is the **only** check: authentication + workspace derivation. **No operator role is verified.** So any Clerk user who belongs to the workspace's org can call every write tool (`nobc_approve_application`, `nobc_cancel_event`, `add_to_red_list`, `issue_comp_ticket`, etc.). This is the same unenforced-RBAC gap analyzed in full in `07-operator-dashboard` (Audit findings — authorization gap).

Caveat on Rule #5 below ("Destructive tools require explicit operator approval"): that human-in-the-loop gate lives in the **Runtype master agent**, not in this server — the MCP endpoint itself will execute a destructive `tools/call` for any authenticated org member without a server-side approval or role check. When the Stage 07 RBAC fix lands, gate the MCP write path on it too.

## What this stage does NOT own

- The Tenur MCP or Producer MCP → external (Tenur team / existing Producer codebase)
- The Runtype master agent that orchestrates across MCPs → `09-ai-chat/` is the consumer; agent config lives in Runtype itself
- Outbound webhooks (Phase J, Svix) → `11-producer-integration/`
