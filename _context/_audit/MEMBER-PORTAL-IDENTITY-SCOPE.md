# Member Portal Identity Scope — Implementation Plan

**Status:** PLAN ONLY — no code changes  
**Decision:** Option B approved by Adam  
**Date:** 2026-06-11  
**Prereqs:** ADR-001 (orgs = operator tenants), PUBLIC-CHECKOUT-AUTH-MODEL.md, PUBLIC-CHECKOUT-SECURITY-REVIEW.md F3

---

## 1. What Is Broken Today (Ground Truth, Code-Verified)

### 1a. `getMemberWorkspaceId` resolves via Clerk org — not Member record

`lib/auth.ts` exports two public symbols:

- `getOrCreateWorkspaceForUser(clerkUserId)` — 100% org-based. Calls `auth().orgId` for a fast path, then falls back to `clerkClient().users.getOrganizationMembershipList`. If the list is empty it **throws** `"No organization membership found for user <id>"`.
- `getMemberWorkspaceId(userId)` — wraps the above in try/catch, returns `null` on throw.

Result: any user without a Clerk org membership gets `null` from `getMemberWorkspaceId`. Since NoBC members are orgless (ADR-001: orgs = operator workspaces; member sign-ups are orgless), every real member portal request hits the null path.

### 1b. Every `/m` page blocks on that null

`app/m/(portal)/layout.tsx` (and every `app/m/(portal)/*/page.tsx`, `app/m/pass/page.tsx`, `app/m/events/actions.ts`, all `app/api/m/*`, `app/api/rsvp/*`, `app/api/wallet/*`) calls `getMemberWorkspaceId(userId)`. On null they either render `<MemberWorkspaceGate />` or redirect to `/apply`.

`MemberWorkspaceGate` copy currently reads:  
> "Member pages are tied to a Clerk organization and workspace. This account is not in an organization yet… Ask an operator for an invite, or confirm your Clerk user has an active org membership."

This copy leaks the internal architecture and contradicts the product model. Must be replaced regardless of slice.

### 1c. `Member.clerkUserId` is NOT a real Clerk user id for most rows

The field is `String` (non-nullable in Prisma schema) but is systematically populated with synthetic placeholders:

| Origin | Placeholder pattern |
|---|---|
| `app/api/apply/membership/[id]/submit/route.ts` line 74 | `app_${application.id}` |
| `lib/event-access-submit.ts` line 121 | `guest:${normalizedEmail}` |
| `app/api/operator/members/create/route.ts` line 104 | `manual:${randomUUID()}` |
| `lib/applications/approve.ts` via `resolveMember` | `applicant:${app.id}` |

The only path that writes a **real** Clerk userId is `app/api/apply/[slug]/route.ts` line 161 — and only when the applicant was signed in at the moment of submission (`if (userId && data.rsvpEventId)`; partial condition).

**Correction to brief:** The brief listed three placeholder prefixes (`app_*`, `guest:*`, `manual:*`). There are actually **four**: the approval path (`lib/applications/approve.ts`) uses `resolveMember` which calls through with `clerkUserId: \`applicant:${app.id}\`` (not `app_*`). The submit route (`app/api/apply/membership/[id]/submit`) writes `app_${application.id}` directly, bypassing `resolveMember`.

### 1d. No existing account-linking mechanism

Grep confirms: no `createOrganizationMembership`, no Clerk webhook handler at `app/api/clerk-webhook` or similar. There is no code path that connects a real Clerk sign-in to an existing Member row. The parked "import + identity unification" thread in STATE-OF-PLAY was never built.

### 1e. `Member` schema has the right unique constraints already

```
@@unique([workspaceId, clerkUserId])   -- prevents duplicate real-userId claims per workspace
@@unique([workspaceId, email])          -- the natural dedup key; currently the only reliable one
@@index([workspaceId])
```

No schema additions are strictly required for the core claim path. One additive field (`claimedAt DateTime?`) is recommended for auditability (see §4).

### 1f. Operator path is isolated and must not be touched

`lib/operator-role.ts` calls `getMemberWorkspaceId` in zero places. The operator resolution chain (`getOrCreateWorkspaceForUser` → Clerk org → workspace) is entirely separate from the member portal call chain. The two call the same underlying function, which is the problem — they need to diverge.

---

## 2. Resolution Model

### Decision

Introduce a new function **`getMemberPortalContext(clerkUserId)`** in `lib/auth.ts` that resolves workspace purely from the `Member` table:

```
db.member.findFirst({
  where: { clerkUserId: userId, status: { in: ['APPROVED', 'GUEST'] } }
  select: { workspaceId: true, id: true, status: true }
})
```

This function is member-only. It does not touch Clerk orgs.

`getMemberWorkspaceId` keeps its current signature and body — operator-side callers (SMS routes, wallet, the few `/api/sms/*` routes) are currently relying on it for workspace resolution because their callers ARE org members (operators). Do not change or rename `getMemberWorkspaceId` without auditing each of its 20+ call sites.

**Precedence rule (no conflict — separate code paths):**

- **Operator routes** (`/operator/*`, `/api/operator/*`, `/api/sms/*`, `/api/agent/*`, `/api/intelligence/*`) → keep calling `getMemberWorkspaceId` / `getOrCreateWorkspaceForUser` (org-based). Unchanged.
- **Member portal routes** (`/m/*`, `/api/m/*`, `/api/rsvp/*`, `/api/wallet/*`) → migrate to `getMemberPortalContext`. These routes currently call `getMemberWorkspaceId` which returns null for orgless members — every one of these is a broken call site that needs the swap.

The call sites to migrate (complete list from grep):

```
app/m/(portal)/layout.tsx
app/m/(portal)/page.tsx
app/m/(portal)/rsvps/page.tsx
app/m/(portal)/profile/page.tsx
app/m/(portal)/help/page.tsx
app/m/(portal)/application/page.tsx
app/m/pass/page.tsx
app/m/events/actions.ts
app/api/m/rsvps/route.ts
app/api/m/profile/route.ts
app/api/m/events/[slug]/access/submit/route.ts
app/api/m/events/[slug]/access/payment-intent/route.ts
app/api/rsvp/route.ts
app/api/rsvp/cancel/route.ts
app/api/rsvp/plus-one/route.ts
app/api/wallet/apple/[rsvpId]/route.ts
app/api/wallet/google/[rsvpId]/route.ts
```

Note: `app/api/sms/*` routes use `getMemberWorkspaceId` for **operator** users (House Phone is an operator tool). Do NOT migrate them to the member-record path.

---

## 3. Account Claim / Linking

### The problem

When an approved member signs into their Clerk account for the first time, their `Member.clerkUserId` contains a placeholder (`app_*`, `applicant:*`, `manual:*`, or `guest:*`). The member portal lookup `db.member.findFirst({ where: { clerkUserId: userId } })` returns nothing. Portal is still blocked.

### Solution: bootstrap claim at first `/m` access

**Trigger:** A new server-side function `claimMemberIdentity(clerkUserId, verifiedEmail)` runs inside `getMemberPortalContext` when the direct `clerkUserId` lookup returns no row.

**Matching rule:** VERIFIED email only. Clerk provides `primaryEmailAddress.verification.status === 'verified'` on the user object. This is fetched via `clerkClient().users.getUser(clerkUserId)` if needed, or trusted from the session's `sessionClaims` if the email claim is present and verified.

**Claim logic (pseudocode — not implementation):**

```
1. Look up db.member.findMany({ where: { email: verifiedEmail } })
   // May return rows from multiple workspaces (multi-tenant)
2. For each candidate row:
   a. Verify candidate.workspaceId is a real workspace (sanity check)
   b. Verify candidate.clerkUserId matches a placeholder prefix
      (starts with "app_", "applicant:", "guest:", "manual:")
      — never overwrite a real Clerk userId
   c. If candidate.status === APPROVED or GUEST → eligible for claim
3. If exactly one APPROVED candidate across all workspaces:
   → update, return { workspaceId, memberId }
4. If multiple APPROVED candidates (multi-workspace member):
   → pick the most-recently-approved one; log a warning for manual review
   → future slice: multi-workspace picker UI
5. If zero APPROVED, one or more GUEST:
   → claim the GUEST row; member is authenticated but not yet approved
   → portal can show a "your application is pending" state
6. Write Member.clerkUserId = realClerkUserId (replaces placeholder)
   Write Member.claimedAt = now (new additive field — see §4)
7. Return { workspaceId, memberId, status }
```

**Idempotency:** The `@@unique([workspaceId, clerkUserId])` constraint ensures a real userId can only land on one row per workspace. If `claimMemberIdentity` is called concurrently (two requests racing at first sign-in), the second Prisma update will either be a no-op (same userId already written) or throw a unique-constraint violation that the caller handles by re-reading the now-claimed row.

**Where it runs:** Inside `getMemberPortalContext`, not in middleware. Middleware runs too early (Clerk `auth()` is session-only, no verified email without a Clerk API call). Server components and route handlers already have the request context needed.

**Draft shape of `getMemberPortalContext`:**

```typescript
// lib/auth.ts (new export — do not modify existing exports)
export async function getMemberPortalContext(
  clerkUserId: string | null | undefined
): Promise<{ workspaceId: string; memberId: string; status: MemberStatus } | null>
```

Returns null only when no Member row can be found or claimed. Callers replace `getMemberWorkspaceId(userId)` with this and also get `memberId` directly, eliminating a second `db.member.findFirst` call that every `/m` page currently makes after the workspace lookup. That's a net DB-query reduction in addition to fixing the bug.

---

## 4. Schema — Additive Only

One additive field is required, one index already exists:

### New field: `Member.claimedAt`

```prisma
// Add to model Member:
claimedAt  DateTime?   // set when a real Clerk userId replaces a placeholder
```

Purpose: audit trail. Lets operators see when a member completed identity linking. Required by the security review (PUBLIC-CHECKOUT-SECURITY-REVIEW.md F3 recommends a claim audit). Nullable so existing rows are unaffected.

No other schema changes needed. The `@@unique([workspaceId, clerkUserId])` constraint already exists and correctly enforces one claimed identity per workspace. The `@@unique([workspaceId, email])` constraint already enforces the email uniqueness needed for the lookup.

**Migration workflow (per absolute rules — no `db push`):**

1. Add `claimedAt DateTime?` to `prisma/schema.prisma`.
2. `prisma generate` to update the client.
3. `prisma migrate diff --from-schema-datasource --to-schema-datamodel --script` → produces `ALTER TABLE "Member" ADD COLUMN "claimedAt" TIMESTAMP(3);` (purely additive).
4. Review diff — confirm no DROP, no ALTER TYPE, no RENAME.
5. `prisma db execute --file <migration.sql>` against Neon. Adam runs this step.

No GIN index touched. No Producer-shared tables touched.

---

## 5. Multi-Workspace (Multi-Tenant) Security

This is the sharpest edge. A person can legitimately be a member of two clubs on the platform (Workspace A and Workspace B). Both workspaces may have a Member row with matching `email`.

**Rules:**

1. Claiming is **per-workspace-scoped** — a single sign-in links the Clerk userId to one Member row per workspace independently. The `@@unique([workspaceId, clerkUserId])` constraint enforces this.
2. `getMemberPortalContext` must return a workspace. For the S-slice (single-tenant / NoBC only), return the single matched workspace. For the M-slice, a multi-workspace member needs a workspace-picker step (out of scope for S).
3. **Never let a claim in workspace A affect workspace B.** The `db.member.update({ where: { id: candidate.id, workspaceId: candidate.workspaceId } })` write must include the `workspaceId` in the where-clause (defense-in-depth against an id collision).
4. Claiming must verify the email belongs to the current sign-in's Clerk account. Do not trust email from the request body — pull it from `clerkClient().users.getUser(clerkUserId).primaryEmailAddress` (verified flag must be true). This directly addresses F3 from PUBLIC-CHECKOUT-SECURITY-REVIEW.md.
5. Never overwrite an existing real Clerk userId with another. Guard: `if (!isPlaceholder(existingClerkUserId)) skip`.
6. Rate-limit the Clerk API call at the function level (one call per request, cached on the session/request context).

---

## 6. Guest → Member Continuity

`guest:${email}` Member rows are created when a non-member buyer tickets an event (`lib/event-access-submit.ts` line 121). These have `status: GUEST`.

When that person later signs in and hits `/m`:

1. `getMemberPortalContext` finds no row by Clerk userId.
2. Claims the `guest:${email}` row (eligible: it's a placeholder, email matches).
3. Returns `{ workspaceId, memberId, status: 'GUEST' }`.
4. The portal renders a "guest" state — they can see their ticket history but not full member content (APPROVED-gated content is status-checked at the component level, not at the portal gate).

When they later apply and get approved:
- `lib/applications/approve.ts` calls `resolveMember` which finds the now-real-clerkUserId row (no longer a placeholder) and does an upsert update. The `clerkUserId` is already correct; only `status` changes to `APPROVED`.
- No double-linking issue: the unique constraint prevents a second row from being created.

**Important:** `resolveMember` currently passes `clerkUserId: \`applicant:${app.id}\`` at approval time. After a member has claimed their row (real Clerk userId written), this upsert falls back to the `@@unique([workspaceId, email])` path (find-by-email), not the clerkUserId path. That is already the correct behavior — `resolveMember` does `findFirst` by `{ email }` first. Confirm in code before S-slice implementation that `resolveMember`'s upsert logic won't overwrite a real Clerk userId with `applicant:*`.

---

## 7. S / M / L Slices

### S — Minimum: make approved orgless members able to log in (recommended first slice)

**Scope:**
- Add `getMemberPortalContext(clerkUserId)` to `lib/auth.ts`. Resolves by `Member.clerkUserId` first, then claims by verified email (lazy at first sign-in).
- Migrate the one layout-level call site: `app/m/(portal)/layout.tsx`. The layout gates all portal children — fixing it here unblocks the whole `/m/(portal)` tree without touching individual pages.
- Replace `MemberWorkspaceGate` copy with on-brand member-facing language (no architecture leakage). Suggested: "We couldn't find a membership linked to this account. If you applied, make sure you're signed in with the same email address." (Subject to Adam's copy approval — this is UI copy law territory.)
- Add additive `claimedAt DateTime?` migration.
- No changes to operator paths, no multi-workspace picker.

**What the member sees:** Sign in → `/m` → portal renders their name, upcoming events, RSVPs. For a first-timer whose row was `app_*` placeholder, the claim runs silently on first load (~1 extra DB write, no round-trip to user).

**What we are NOT doing in S:**
- Multi-workspace picker
- Migrate all 17 remaining call sites (do after S validates the approach)
- `/api/m/*` route migration (server components use the layout; API routes can stay null-returning temporarily since the portal pages don't call them until rendered)
- `app/m/pass/page.tsx` — wallet pass flow (separate feature, separate slice)
- Any changes to `getMemberWorkspaceId` or its operator call sites
- Any backfill script (lazy claim at first login is sufficient for V1)

**Files changed in S-slice:**
- `lib/auth.ts` — add `getMemberPortalContext`, `claimMemberIdentity` (internal)
- `prisma/schema.prisma` — add `claimedAt DateTime?`
- `app/m/(portal)/layout.tsx` — swap `getMemberWorkspaceId` → `getMemberPortalContext`
- `app/m/events/_components/MemberWorkspaceGate.tsx` — replace copy
- Migration SQL (additive ALTER TABLE) — Adam executes against Neon

**Approximate implementation cost:** 1 focused Spine session. The new function is ~60 lines. Layout change is 3-line swap. Gate copy is 1 string.

---

### M — Extend to all member call sites + pass page

After S validates:
- Migrate all 17 remaining `getMemberWorkspaceId` call sites in `/m/*` and `/api/m/*` to `getMemberPortalContext`.
- Migrate `app/m/pass/page.tsx`.
- Migrate `app/api/rsvp/*` and `app/api/wallet/*` — these are member-initiated actions that currently silently fail for orgless members.
- Add status-aware portal gate: APPROVED members see full content; GUEST members see a limited "you have a ticket" view with an application CTA.
- Confirm `resolveMember` does not overwrite a claimed real Clerk userId with `applicant:*` (add guard if needed).

**Files added in M beyond S:** all 17 migrated call sites, `lib/member-identity.ts` guard.

---

### L — Multi-workspace + operator-visible claim audit

- Multi-workspace member picker (person is in two clubs; choose which portal to enter).
- Operator Team dashboard: show `claimedAt` per member so operators can see who has activated their portal access.
- Backfill script: for members with placeholder `clerkUserId` whose email already matches a Clerk user in the system (requires Clerk API enumeration — expensive, needs Adam sign-off on cost/privacy).
- Consider `CLERK_WEBHOOK_SIGNING_SECRET` + a `POST /api/clerk-webhook` handler to eagerly claim on `user.created` events rather than lazily at first load.

---

## 8. Risks / Do-Not-Break

### Risk 1 (HIGH): Breaking operator workspace resolution

`getMemberWorkspaceId` is called by 5 `/api/sms/*` routes that are operator tools. If those routes are accidentally migrated to `getMemberPortalContext`, operator users (who have org memberships) will fail their workspace lookup because `getMemberPortalContext` doesn't look at Clerk orgs.

**Mitigation:** The new function has a different name. S-slice touches only the layout. The SMS routes are explicitly excluded from the migration list. Add a code comment to `getMemberPortalContext` in `lib/auth.ts`: `// Member-portal only — do NOT use for operator routes.`

### Risk 2 (HIGH): Claiming the wrong Member row (email collision across workspaces)

In multi-tenant operation, `WHERE email = ?` without `workspaceId` scoping returns rows from all workspaces. If a person is `guest:foo@example.com` in Workspace A and `app_xyz` in Workspace B, the claim logic must not cross-assign.

**Mitigation:** The claim loop processes each workspace independently. Workspace scoping is enforced on the `db.member.update` write (where-clause includes `workspaceId`). For S-slice (NoBC = single tenant), this is theoretical but the guard must still be written correctly because multi-tenant is day-one design. Do not skip it.

### Risk 3 (MEDIUM): `resolveMember` overwriting a claimed real Clerk userId

`lib/applications/approve.ts` calls `resolveMember({ clerkUserId: \`applicant:${app.id}\` })` after a member may have already claimed their row (real userId written). `resolveMember` finds by email first (via `findFirst { where: { workspaceId, OR: [{ email }, { clerkUserId }] } }`) and returns the existing row without updating it (it's a find-or-create, not an upsert). So the real Clerk userId is safe — `resolveMember` creates only when nothing is found.

**Confirm before M-slice:** Read the full `resolveMember` body to verify the update branch (if any) does not touch `clerkUserId`. If there is an `update` in the upsert path that sets `clerkUserId`, add a guard: `clerkUserId: isPlaceholder(existing.clerkUserId) ? input.clerkUserId : existing.clerkUserId`.

### Risk 4 (LOW): Race condition at first claim

Two concurrent requests on first sign-in both find no row by Clerk userId, both attempt to update by email. The second update is a no-op (same value) or hits the `@@unique([workspaceId, clerkUserId])` constraint if there's a rare timing window. Both paths are safe: the constraint throws a P2002 which the caller handles by re-reading. Idempotency holds.

### Risk 5 (LOW): Non-verified email claim

Clerk allows users to sign in with an unverified email in some configurations. If `clerkClient().users.getUser(id).primaryEmailAddress.verification.status !== 'verified'`, the claim must be refused. The portal renders as "not yet verified — check your inbox." This is a one-line guard but must not be omitted.

---

## 9. Schema Required? Summary

**Yes, one additive field:**

```prisma
// model Member
claimedAt  DateTime?
```

Nothing else. No new tables. No index changes. No foreign keys. `prisma db push` is still forbidden. Adam executes the migration SQL against Neon.

---

## 10. Terminology Compliance

Any new member-facing copy (gate message, pending state) must follow canonical terminology:

- If showing event access state: "Event Access" not "RSVP"
- If showing member status: map enum values to display strings before rendering (`APPROVED` → never shown raw, show "Member"; `GUEST` → "Guest"; `PENDING` → "Application pending")
- Warm, editorial tone — not system error copy

The current `MemberWorkspaceGate` copy violates this rule (exposes Clerk/org architecture). It must be replaced in S-slice regardless of whether the full claim logic is implemented, because the copy will be visible to real members during the transition.

---

## 11. Files In Play (Complete)

| File | Change |
|---|---|
| `lib/auth.ts` | Add `getMemberPortalContext`, `claimMemberIdentity` |
| `prisma/schema.prisma` | Add `claimedAt DateTime?` to Member |
| `app/m/(portal)/layout.tsx` | Swap `getMemberWorkspaceId` → `getMemberPortalContext` |
| `app/m/events/_components/MemberWorkspaceGate.tsx` | Replace copy |
| Migration SQL (new file) | `ALTER TABLE "Member" ADD COLUMN "claimedAt" TIMESTAMP(3)` |
| **M-slice additions** | |
| `app/m/(portal)/page.tsx` | Swap resolution fn |
| `app/m/(portal)/rsvps/page.tsx` | Swap resolution fn |
| `app/m/(portal)/profile/page.tsx` | Swap resolution fn |
| `app/m/(portal)/help/page.tsx` | Swap resolution fn |
| `app/m/(portal)/application/page.tsx` | Swap resolution fn |
| `app/m/pass/page.tsx` | Swap resolution fn |
| `app/m/events/actions.ts` | Swap resolution fn |
| `app/api/m/rsvps/route.ts` | Swap resolution fn |
| `app/api/m/profile/route.ts` | Swap resolution fn |
| `app/api/m/events/[slug]/access/submit/route.ts` | Swap resolution fn |
| `app/api/m/events/[slug]/access/payment-intent/route.ts` | Swap resolution fn |
| `app/api/rsvp/route.ts` | Swap resolution fn |
| `app/api/rsvp/cancel/route.ts` | Swap resolution fn |
| `app/api/rsvp/plus-one/route.ts` | Swap resolution fn |
| `app/api/wallet/apple/[rsvpId]/route.ts` | Swap resolution fn |
| `app/api/wallet/google/[rsvpId]/route.ts` | Swap resolution fn |
| `lib/member-identity.ts` | Add guard: don't overwrite real Clerk userId |

**Do NOT touch:**
- `app/api/sms/*` — operator routes, stay on `getMemberWorkspaceId`
- `lib/operator-role.ts` — org-based resolution, untouched
- `lib/auth.ts` existing exports — `getMemberWorkspaceId`, `getOrCreateWorkspaceForUser`, `requireWorkspaceId` stay intact
- Anything under `/apply` or `config/archetypes.ts` (locked)
- Legal copy in `/apply` screen 7 (locked)

---

*Plan authored 2026-06-11. No code was written or modified. Implementation begins on Adam's go.*
