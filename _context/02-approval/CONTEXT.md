# Stage 02 — Approval

> Operator review of submitted applications → approval → welcome email → Member record. Includes Red List + duplicate handling at submit time.

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped + 🟡 Data Integrity Build A (application completion state) committed locally on `data-integrity`, unmerged — Adam's review gates it |
| **V1 item** | #4, #16 |
| **Last updated** | 2026-07-16 |
| **Owner** | Adam |
| **Blocked on** | Adam: (1) review the `data-integrity` branch (Build A), (2) run the additive DDL (`prisma/sql/data-integrity-application-submitted-at.sql` — `ALTER TABLE "Application" ADD COLUMN "submittedAt" TIMESTAMP(3)`) on prod Neon BEFORE any deploy of the branch, (3) run the backfill UPDATE (in the Build A report; `submittedAt = createdAt WHERE aiScore IS NOT NULL OR status <> 'PENDING'`) so already-submitted apps don't read "Not submitted" on deploy. DDL applied to scratch (ep-sweet-term) for local testing only; backfill NOT run anywhere. |
| **Next** | **Apply scalar promotion — read path (2026-07-16, workspace branch `apply-scalar-promotion`, UNCOMMITTED):** `lib/applications/approve.ts` no longer trusts `Application.phone` freshness — it promotes from `ApplicationAnswer` at approval (`promoteApplicationScalars`, fail-soft + logged), passes the promoted phone to `resolveMember`, and fill-if-empty enriches `Member.phone` (resolveMember drops phone on the existing-member path — the normal case since Door 1 mints the GUEST at submit) and `Person.{phone,postalCode}` (ZIP from `homeAddress.zip`; opt-in page stays the authoritative writer, fill-if-empty never fights it). Zero schema change. Adam gates: review/commit/deploy, then post-deploy backfill SQL (session report). — PRIOR: **Data Integrity Build A (2026-07-12, branch `data-integrity`, committed local-only, NOT pushed/merged/deployed):** `Application.submittedAt` (additive column) is now THE completion signal — written only by the apply submit transaction (plus the BLOCKED-watchlist auto-reject branch, which is still a real submit) — and `app/api/operator/applications/route.ts` stops aliasing `createdAt` as `submittedAt` (returns both; queue sort + row relative-time repointed to `createdAt`, the value they were always actually reading). The **approve-guard** is server-side in `lib/applications/approve.ts` (new `not_submitted` outcome + `allowUnsubmitted` param): single-approve blocks with an explicit "Approve anyway" ConfirmModal (split-view queue incl. the `a` shortcut, and the full-page decision bar); bulk approve, the agent tool, and the MCP tool hard-block with no override (bulk failure copy is human-readable — never the raw code). Queue: "Not submitted" badge (precedence over "No AI review yet"), "Hide incomplete" client-side filter toggle, null-safe Submitted field. Full-page detail: warning badge + "never submitted, so it has not been scored" explainer. Dev seeds (`lib/dev/demo-applications.ts`, `scripts/seed-applications.mjs`) stamp submittedAt mirroring the backfill rule. Pinned by `tests/unit/application-approve-guard.test.ts`; `tests/unit/apply-submit-route.test.ts` collection repaired (vitest oxc JSX override + `$transaction` mock) and now green 9/9. Adam: review, run the two SQL blocks (see Blocked on), merge + deploy himself. — PRIOR: Spot-check on a live wide monitor + mobile: (a) the post-approve flash now appears in the sticky footer at the point of action, and (b) the queue comment thread posts/persists/attributes correctly. 2026-05-31: **fixed two QA bugs in the split-view review queue (`ApplicationsQueue.tsx`), commits `3179fe2` + `a4cc9d0`.** (Bug #2 — silent approve) The success/error `flash` rendered only at the top of the queue container, but operators act from the `sticky bottom-0` footer in `DetailPanel`, so approve felt silent and the panel "flipped" to the next applicant with no confirmation. `flash` is now passed into `DetailPanel` and also rendered just above the action buttons, and `postAction`'s message names both the acted-on and next applicant ("Celia approved — now reviewing Bob") so the auto-advance is explicit. (Bug #1 — fake comment box) The queue's "Private note (optional)" textarea looked like a comment box but had no submit/author/timestamp/persistence — it just rode along on the next decision POST as `{note}` and was cleared after. The real persisted+attributed `CommentThread` (POSTs to `/api/operator/comments`) only rendered on the separate `/applications/[id]` detail page, **not** in the split-view queue the tester used. Embedded `CommentThread entityType="application"` into `DetailPanel` and relabeled the textarea "Decision note" with copy clarifying it's saved with the approve/reject/waitlist action. Both reuse existing components/state — no backend or schema change. tsc clean per commit. **NOT pushed/deployed** (local `main` ahead of `origin/main`). — 2026-05-30: **fixed unreachable approve/reject buttons** in `ApplicationsQueue.tsx` — the detail panel used a hardcoded `lg:h-[calc(100vh-10rem)] lg:flex-none` whose 10rem offset underestimated the chrome above (top bar + PageHeader + tabs), so the fixed-height panel overflowed the viewport and pushed its `sticky bottom-0` action footer below the fold; `overscroll-contain` on the scroll container then blocked the page-scroll fallback. Replaced the magic-offset height with `flex-1 min-h-0` (the existing `min-h-0` flex chain from layout `<main>` already bounds it to the real viewport leftover), removed `overscroll-contain`, and switched the mobile sheet from `fixed inset-0` (static 100vh) to `h-[100dvh]` + a single scroll container (dropped the redundant `overflow-y-auto` on the wrapper so `DetailPanel` is the sole scroller). tsc clean. Monitor production; V1.5 will add SMS welcome via Stage 11. (2026-05-21: review queue + full-page detail now render genuine-shape submissions — full-page archetype bars iterate the six archetypes via `scorePct`, `basics.referrers` JSON → clean Referrers list, `photos.urls` → photo strip, split-view consents → checkboxes (`consentEmail`/`consentSms`), all dotted answer keys labeled. Demo seed enriched to the full ~43-field live-form answer set. Non-demo stray data (Jordan Mercer et al.) purged — workspace is demo-seed-only.) Audit 2026-05-21: corrected the Schema fields section (no `Member.applicationId`, `Application.memberId` is a bare scalar/no-FK, RedList fields) and added the contact/CRM data-model map below. 2026-05-26: **detail panel widened for wide viewports** — `applications/page.tsx` view cap raised 1400→1760px; the `DetailPanel` in `ApplicationsQueue.tsx` is now an `@container` (Tailwind v4 container queries) so it adapts to *panel* width, not viewport: contact row goes horizontal, archetype bars + short answers flow two-column, photos enlarge, long-form answers stay full-width (`@xl:col-span-2`, source order preserved). tsc + next build clean. Next action: review the open PR (`claude/operator-detail-panel-width`) — do not auto-merge — and spot-check the two-column answer split on a live wide monitor. Members/Events were checked: they use separate full-page detail routes, not this panel, so the fix is Applications-only (not a shared component). |

## Scope

This stage owns everything from the moment an `Application` row is written (by stage 01) to the moment an approved applicant becomes a `Member` and receives a welcome email. Also owns Red List screening and duplicate detection at submit time.

## Files in play

```
app/operator/applications/page.tsx                            ← review queue page (server)
app/operator/applications/_components/ApplicationsQueue.tsx   ← split-view triage queue + detail panel (bars, consents, photos, answers)
app/operator/applications/[id]/page.tsx                       ← single application detail (full-page)
app/api/operator/applications/route.ts                        ← list endpoint (queue feed; returns consents)
app/api/operator/applications/[id]/route.ts                   ← single-application read (detail panel)
app/api/operator/applications/[id]/approve/route.ts           ← approve endpoint
app/api/operator/applications/[id]/reject/route.ts            ← reject endpoint
app/api/operator/applications/[id]/waitlist/route.ts          ← waitlist endpoint
app/api/operator/applications/[id]/hold/route.ts              ← on-hold endpoint
app/api/operator/applications/bulk/route.ts                   ← bulk approve/reject/waitlist
lib/applications/approve.ts                     ← approve path — creates Member, fires welcome email via Resend
lib/watchlist.ts                                ← Red List + WatchList string-match screening at submit/approval (single module, replaces the never-created lib/red-list/ and lib/duplicates/ splits)
lib/email-templates.ts                          ← welcomeMemberEmail + other Resend templates
lib/operator-application-display.ts             ← referrer lines (parses basics.referrers JSON), queue preview
lib/legacy-answer-labels.ts                     ← dotted-key → human label resolution for answer rows

# Data Integrity Build A (2026-07-12, `data-integrity` branch)
app/operator/applications/[id]/application-decision-bar.tsx  ← sticky approve/reject bar — now gates approve behind "Approve anyway" when submittedAt is null
prisma/sql/data-integrity-application-submitted-at.sql       ← additive DDL for Application.submittedAt — applied to scratch only; Adam runs on prod
tests/unit/application-approve-guard.test.ts                 ← pins the not_submitted guard + allowUnsubmitted override
app/operator/events/[id]/_components/EventApplicationsTab.tsx ← (Stage 03 surface) shares ApplicationsQueue — row shape gained createdAt/nullable submittedAt
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

> ⚠️ Audit 2026-05-21 corrected several entries here against `prisma/schema.prisma`. Originals were aspirational and did not match shipped fields.

- `Application.status` enum: `PENDING | APPROVED | REJECTED | WAITLISTED | HOLD`
- `Application.duplicateFlag` **Boolean** (`schema.prisma:184`) — not `duplicateOf` FK; there is no Application↔Application self-relation.
- No `Application.redListMatch` column exists. Red List screening is computed at submit/approval time (see Red List below), not stored on the Application.
- **Applicant↔Member link:** `Application.memberId String?` (`schema.prisma:166`) — a **bare scalar with no `@relation` and no FK**. There is **no `Member.applicationId`** (Member, `schema.prisma:111-143`, has no application field). See the contact-model map below — this link is fragile.
- **RedList** model (`schema.prisma:599-611`): workspaceId, `email?`, `namePattern?`, `reason?`, `addedByPersonId?` — matches blocked people by **email/name string**, no FK. (Not `type/matchEmail` — that's WatchList.)
- **WatchList** model (`schema.prisma:618-636`): `type (PURPLE|BLOCKED)`, `matchEmail?`, `matchPhone?`, `matchInstagram?`, `note?` — VIP/flag list, matches by string, no FK.
- **EmailTemplate** model: per-workspace overridable templates (welcome, comp ticket, etc.) — Resend `from` always resolves to `team@thenobadcompany.com`
- **MembershipTier** model: the tier assigned to a Member at approval time (charter / standard / waitlist)

## Audit findings — contact / CRM data model map (2026-05-21, code-verified, read-only)

**Verdict: contact identity is FRAGMENTED — there is no canonical person/contact entity.** No `DirectoryPerson` / `DirectoryCompany` / `Contact` model exists anywhere (grep: zero hits). The schema is a single `prisma/schema.prisma` on the Neon instance shared with Producer; **no model is annotated Producer-owned** — the only Producer reference is the scalar `Event.producerEventId` (`:301`). The same human's name/email/phone is stored independently across ≥8 models.

**Person/contact models (all carry `workspaceId`, all indexed):**

| Model | file:line | Identity fields | Link to a person |
|---|---|---|---|
| **Member** | `:111-143` | clerkUserId, email, firstName, lastName, phone, memberQrCode | closest-to-canonical for *approved* members; `@@unique([workspaceId,clerkUserId])` + `@@unique([workspaceId,email])` |
| **Application** | `:162-197` | email, fullName, phone | `memberId` scalar (no FK); link is fragile (below) |
| **RSVP** | `:384-441` | guestEmail/guestName, attendeeName/Email/Phone, plusOneName | **required FK `memberId` → Member** (solid) |
| **Order** | `:913-950` | buyerName/Email/Phone, `buyerMemberId` scalar | **dead** — never written in app code; `order.create` is a stub (`lib/mcp/legacy-tools.ts:456`) |
| **WaitlistEntry** | `:503-522` | email, name | optional FK `memberId`, else free strings |
| **AccessToken** | `:952-979` | compAttendeeName/Email | comp recipient — **no FK to Member** |
| **RedList** | `:599-611` | email?, namePattern? | standalone — string match, no FK |
| **WatchList** | `:618-636` | matchEmail/Phone/Instagram | standalone — string match, no FK |
| **Ticket** | `:450-472` | (identity via member) | required FK memberId + rsvpId; **never created in code** |

**Cross-linking the same real person:**
- **Applicant → Member: NOT a reliable FK.** Three divergent member-creation paths: `lib/applications/approve.ts:47` upserts on `workspaceId_email` with sentinel `clerkUserId="applicant:<id>"` and **does not** write `Application.memberId`; `app/api/apply/membership/[id]/approve/route.ts:66-82` upserts on `workspaceId_email`, sentinel `app_<id>`, and **does** write `memberId`; `app/api/apply/membership/[id]/submit/route.ts:88` also writes it. So `Application.memberId` is set by 2 of 3 paths and **never read as a join**. The member directory re-derives archetype/score by **lowercased-email match** instead (`app/api/operator/members/route.ts:44-58`, code comment: *"Member doesn't store these"*).
- **De-dup relies on two unique constraints**, not reconciliation logic: `@@unique([workspaceId,email])` and `@@unique([workspaceId,clerkUserId])` on Member. An approved applicant (email-keyed, sentinel clerk id) who later signs in via Clerk is reconciled only because `getOrCreateMemberFromClerk` (`lib/clerk-member.ts:29-33`) bails when the email is taken. Note `app/api/.../apply-event-rsvp.ts:40` upserts on `workspaceId_clerkUserId` (real id) — a *different* key than the approve paths.
- **Member → RSVP/ticket-buyer: solid FK.** `RSVP.memberId` is required (`:391`); buying always resolves the Member by Clerk id first (`stripe/checkout/route.ts:35`, etc.) then sets `memberId`. Ticket-buyer identity rides on RSVP (+ `stripePaymentIntentId`), not Order.
- **Guests / comps / red-list / watch-list: NO FK** — matched by email/phone/name/instagram strings at apply/RSVP time (`lib/watchlist.ts`, `app/api/apply/[slug]/route.ts:65-73`).

**Workspace-scoping:** every person/contact model carries indexed `workspaceId`; all reviewed queries filter on it. No person model lacks `workspaceId`.

## Rules — DO NOT VIOLATE

1. **No SMS in V1.** Welcome flow is email-only via Resend. SMS welcome is V1.5 and would route through Stage 14 (House Phone) — not Stage 11. The earlier Runtype-based House Phone trigger in Stage 11 was scratched.
2. **Welcome email never sends without operator approval.** No auto-approval logic, even for high-score applicants.
3. **Red List check runs at submit AND approval.** Submit-time flags the application; approval-time hard-blocks if matched.
4. **Duplicate detection runs at submit.** Match on normalized email, normalized phone, and (name + birthday) tuple. On match, set `duplicateOf` and surface to operator.
5. **Every approve/reject/waitlist writes an `AuditEvent`** with actorType, actorId, applicationId, action, reason.

## What this stage does NOT own

- The application form itself → `01-apply/`
- SMS welcome → V1.5, via `14-house-phone/` (House Phone owns SMS end-to-end; the Runtype-based "House Phone trigger" in Stage 11 was scratched)
- The operator dashboard shell + auth → `07-operator-dashboard/`
- Member directory views → `07-operator-dashboard/`
