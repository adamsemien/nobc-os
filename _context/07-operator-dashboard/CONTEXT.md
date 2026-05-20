# Stage 07 — Operator Dashboard

> The operator-facing surface: shell, navigation, member directory, audit log viewer. Individual feature dashboards (applications, events, RSVPs, payments) are owned by their respective stages.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #20 (audit_events portion), #22 (7-theme system), #24 (operator bulk delete), #28 (roles & permissions — Roles & Permissions section lives in root CLAUDE.md) |
| **Last updated** | 2026-05-20 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | Roll the editorial dashboard treatment outward — apply the same hairline + display-numeral language to `/operator/applications` and `/operator/events` index pages |

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
app/operator/layout.tsx                                  ← shell + nav
app/operator/page.tsx                                    ← editorial dashboard home (masthead → numerals → tonight → journal → marginalia)
app/operator/members/page.tsx                            ← directory
app/operator/members/[id]/page.tsx                       ← member detail
app/operator/audit/page.tsx                              ← audit log viewer
app/operator/settings/                                   ← workspace settings (entire directory)
app/operator/_help/                                      ← in-app help / onboarding (entire directory)
app/operator/_components/dashboard/StatColumn.tsx        ← oversized display-font numeral with eyebrow + soft CTA
app/operator/_components/dashboard/SectionHeader.tsx     ← editorial section eyebrow (or display-font heading) with optional action slot
app/operator/_components/dashboard/CapacityBar.tsx       ← 1px hairline capacity indicator for events
app/operator/_components/dashboard/ActivityRow.tsx       ← single audit-row with colored leading rule
app/operator/_components/dashboard/TonightPanel.tsx      ← "Tonight" feature block: today's events + waiting-on-you list
app/operator/_components/dashboard/format.ts             ← shared date/action formatters used across the dashboard components
lib/theme.ts                                             ← active theme resolution (10-theme system + per-workspace override)
lib/permissions.ts                                       ← role → action matrix used by every operator API route
lib/audit.ts                                             ← AuditEvent write + query helpers (single module)
app/globals.css                                          ← `.editorial-fade-in` + `.editorial-stagger-{1..5}` entrance keyframes (honor prefers-reduced-motion)
```

## Inputs

- Operator user (authenticated via Clerk, scoped to workspace)
- `AuditEvent` rows written by every other stage
- `Member`, `Application`, `Event`, `RSVP` rows for directory views

## Outputs

- Operator UI renders
- `AuditEvent` rows for operator-initiated actions in this stage (member edits, settings changes, team invites)

## Schema models

- **Workspace**: the tenant root. Cross-cutting — `workspaceId` lives on every other user-data table. Read/write from any stage; canonical owner is this one.
- **Member**: the approved-applicant record. Created by Stage 02 at approval time, lives in the operator directory here, referenced by Stages 03/04/05/06/11/12.
- **AuditEvent**: workspaceId, actorType (`OPERATOR | MEMBER | SYSTEM | AGENT`), actorId, action, resourceType, resourceId, metadata (JSON), createdAt
- **PlatformSetting**: workspace-scoped key/value settings (theme, branding, feature flags)
- **OperatorComment**: per-resource notes (on an Application, Member, Event, etc.)
- **OperatorNotification**: in-app notifications surfaced in the operator shell
- **Tag** + **EntityTag**: member/application tagging surface used in the directory
- **AccessToken**: operator API tokens (when present)
- Indexes: (workspaceId, createdAt DESC), (resourceType, resourceId)

## Dashboard home — editorial language

The operator home (`app/operator/page.tsx`) is a luxury-magazine read of the workspace, not a fintech panel. The visual contract:

- **Five sections, top → bottom:** masthead (date + display-font headline + thin rule) → four-column numerals (giant `var(--font-display)` numbers separated by vertical hairlines) → "Tonight" (the only urgent moment) → "What's coming" + "Lately" two-column journal → marginalia (birthdays + on-this-day) under a single top hairline.
- **One accent moment.** `var(--primary)` only flips a body element when something demands action — the Pending Applications numeral when count > 0, and `The Room →` as the only filled `--primary` button on the page (lives inside Tonight). Everything else stays in text-primary/secondary/tertiary.
- **Hairlines, not cards.** Surfaces are separated by 1px `var(--border)` rules instead of bordered card backgrounds. Capacity is a 1px line, not a rounded pill.
- **Display font for numerals + section titles.** All large numerals and event titles use `var(--font-display)` directly so per-theme pairings (Obsidian → Cormorant, Parchment → Fraunces, Rose → Playfair, etc.) inherit automatically. Never hardcode `"PP Editorial New"` or any other family name in components.
- **Staggered entrance.** Each major section uses `.editorial-fade-in .editorial-stagger-{n}`; cascade is 80ms per step, gated behind `prefers-reduced-motion: no-preference`.
- **Reusable dashboard components live under `app/operator/_components/dashboard/`** — extracting from `page.tsx` (rather than building inline JSX) is the default when adding a new editorial surface in this stage.

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
