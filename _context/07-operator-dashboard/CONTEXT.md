# Stage 07 — Operator Dashboard

> The operator-facing surface: shell, navigation, member directory, audit log viewer. Individual feature dashboards (applications, events, RSVPs, payments) are owned by their respective stages.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #20 (audit_events portion) |
| **Last updated** | 2026-05-20 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | 7-theme system polish + V1.5 customization features |

## Scope

The operator UI shell and cross-feature surfaces:
- `/operator` shell + side navigation
- Member directory + member detail
- Audit log viewer (read-only)
- Workspace settings (theme, branding, integrations)
- Operator user management (invite, role)
- WCAG 2.2 AA compliance audit (cross-cutting but ownership lives here)

Feature-specific operator UIs (applications review, event editor, RSVP manager, refund button) are owned by the relevant stage but **render inside this shell**.

## Files in play

```
app/operator/layout.tsx                         ← shell + nav
app/operator/page.tsx                           ← dashboard home / activity feed
app/operator/members/page.tsx                   ← directory
app/operator/members/[id]/page.tsx              ← member detail
app/operator/audit/page.tsx                     ← audit log viewer
app/operator/settings/                          ← workspace settings (entire directory)
app/operator/_help/                             ← in-app help / onboarding (entire directory)
lib/theme.ts                                    ← active theme resolution (7-theme system + per-workspace override)
lib/permissions.ts                              ← role → action matrix used by every operator API route
lib/audit.ts                                    ← AuditEvent write + query helpers (single module)
```

## Inputs

- Operator user (authenticated via Clerk, scoped to workspace)
- `AuditEvent` rows written by every other stage
- `Member`, `Application`, `Event`, `RSVP` rows for directory views

## Outputs

- Operator UI renders
- `AuditEvent` rows for operator-initiated actions in this stage (member edits, settings changes, team invites)

## Schema models

- **AuditEvent**: workspaceId, actorType (`OPERATOR | MEMBER | SYSTEM | AGENT`), actorId, action, resourceType, resourceId, metadata (JSON), createdAt
- **PlatformSetting**: workspace-scoped key/value settings (theme, branding, feature flags)
- **OperatorComment**: per-resource notes (on an Application, Member, Event, etc.)
- **OperatorNotification**: in-app notifications surfaced in the operator shell
- **Tag** + **EntityTag**: member/application tagging surface used in the directory
- **AccessToken**: operator API tokens (when present)
- Indexes: (workspaceId, createdAt DESC), (resourceType, resourceId)

## Rules — DO NOT VIOLATE

1. **All operator routes require Clerk auth.** Middleware enforces — every page under `/operator/*` redirects to sign-in if unauthed.
2. **Workspace boundary is absolute.** An operator in workspace A cannot see workspace B's data, period. Every query filters on `workspaceId`.
3. **Every operator action writes an `AuditEvent`.** Member edit, settings change, team invite — all logged.
4. **WCAG 2.2 AA is the bar.** Use Radix UI primitives. No custom interactive elements without accessibility audit.
5. **No hex literals.** Operator dashboard uses CSS variables so white-label theming works per-tenant.
6. **Audit log is read-only.** No edit, no delete. Even by admins.

## What this stage does NOT own

- Application review UI → `02-approval/`
- Event editor → `03-events/`
- Access (RSVP) manager → `04-access/`
- Refund button + payment ops → `05-payments/`
- Check-in dashboard → `06-wallet-checkin/`
- AI chat panel → `09-ai-chat/`
