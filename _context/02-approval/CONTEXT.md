# Stage 02 — Approval

> Operator review of submitted applications → approval → welcome email → Member record. Includes Red List + duplicate handling at submit time.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #4, #16 |
| **Last updated** | 2026-05-20 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | Monitor production; V1.5 will add SMS welcome via Stage 11 |

## Scope

This stage owns everything from the moment an `Application` row is written (by stage 01) to the moment an approved applicant becomes a `Member` and receives a welcome email. Also owns Red List screening and duplicate detection at submit time.

## Files in play

```
app/operator/applications/page.tsx                            ← review queue UI
app/operator/applications/[id]/page.tsx                       ← single application detail
app/api/operator/applications/[id]/route.ts                   ← single-application read (detail panel)
app/api/operator/applications/[id]/approve/route.ts           ← approve endpoint
app/api/operator/applications/[id]/reject/route.ts            ← reject endpoint
app/api/operator/applications/[id]/waitlist/route.ts          ← waitlist endpoint
app/api/operator/applications/[id]/hold/route.ts              ← on-hold endpoint
app/api/operator/applications/bulk/route.ts                   ← bulk approve/reject/waitlist
lib/email/welcome.ts                            ← Resend welcome template
lib/red-list/check.ts                           ← Red List screening
lib/duplicates/detect.ts                        ← email/phone/name match
```

## Inputs

- Submitted `Application` row from stage 01 (with archetype + scores)
- Operator action: approve / reject / waitlist
- Red List entries (workspace-scoped)

## Outputs

- `Member` row created on approve
- Welcome email via Resend (transactional)
- `AuditEvent` row for every operator action
- `Application.status` updated

## Schema fields

- `Application.status` enum: `PENDING | APPROVED | REJECTED | WAITLISTED | HOLD`
- `Application.duplicateOf` nullable FK to another Application
- `Application.redListMatch` boolean
- `Member.applicationId` FK back to Application
- **RedList** model: workspaceId, type, matchEmail, reason
- **WatchList** model: soft-flag counterpart to RedList
- **EmailTemplate** model: per-workspace overridable templates (welcome, comp ticket, etc.) — Resend `from` always resolves to `team@thenobadcompany.com`
- **MembershipTier** model: the tier assigned to a Member at approval time (charter / standard / waitlist)

## Rules — DO NOT VIOLATE

1. **No SMS in V1.** Welcome flow is email-only via Resend. SMS welcome is V1.5 and routes through stage 11 → House Phone.
2. **Welcome email never sends without operator approval.** No auto-approval logic, even for high-score applicants.
3. **Red List check runs at submit AND approval.** Submit-time flags the application; approval-time hard-blocks if matched.
4. **Duplicate detection runs at submit.** Match on normalized email, normalized phone, and (name + birthday) tuple. On match, set `duplicateOf` and surface to operator.
5. **Every approve/reject/waitlist writes an `AuditEvent`** with actorType, actorId, applicationId, action, reason.

## What this stage does NOT own

- The application form itself → `01-apply/`
- SMS welcome → `11-producer-integration/` (V1.5)
- The operator dashboard shell + auth → `07-operator-dashboard/`
- Member directory views → `07-operator-dashboard/`
