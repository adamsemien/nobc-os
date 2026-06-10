# Public Checkout — Auth Model Design

**Status: PENDING WARDEN REVIEW — do not implement.**
**Date: 2026-06-10**
**Author: Spine**

---

## The problem this solves

`/e/[slug]` is a public event page. A visitor can buy a ticket without being a
club member. We need to define how identity is resolved at every stage of that
interaction without leaking operator access, cross-tenant data, or psychographics.

---

## Scope

Paid events only (v1). Guest `priceCents > 0`. Member-only events not purchasable
via this surface — `PublicEventDTO.guestPurchasable: false` signals this to the
page component.

---

## Two identity classes

| Class    | Clerk state                            | Workspace state                          |
|----------|----------------------------------------|------------------------------------------|
| Buyer    | No org membership (Clerk "organizations required" OFF, Adam flips) | No `WorkspaceMember` row. May have a `Member` row with `status: GUEST` keyed by `{workspaceId, email}` |
| Operator | Clerk org member of at least one org   | Has a `WorkspaceMember` row (or Clerk org admin floor) in the workspace that owns the event |

These are NOT distinguished by any flag — they are distinguished structurally by
whether the Clerk session has an `orgId`. A buyer with no org cannot reach
`getOrCreateWorkspaceForUser` successfully (it throws `No organization membership
found`), so `getMemberWorkspaceId` returns `null`. This is the gate.

---

## Member row resolution on `/e/[slug]`

**Workspace is always resolved from the event slug, never from the buyer's session.**

```
workspaceId = db.event.findFirst({ where: { slug, status: 'PUBLISHED' } }).workspaceId
```

A signed-in buyer's `Member` row (if they have one) is looked up by:

```
db.member.findFirst({
  where: { workspaceId: <slug-resolved>, clerkUserId: userId }
})
```

Where `userId` is the Clerk session user ID — purely for recognizing a returning
buyer who previously purchased and had their GUEST row upgraded with a real Clerk
ID via the post-purchase account-link flow (see below).

If no existing row: `findOrCreateGuestMember(workspaceId, email, name)` runs on
checkout, which keys the row by `{ workspaceId, email }` with
`clerkUserId: "guest:{email}"` and `status: GUEST`.

**The buyer NEVER provides their own workspaceId. Workspace is always slug-resolved.**

---

## Buyer signing in — workspace isolation guarantee

`getOrCreateWorkspaceForUser` (in `lib/auth.ts`) throws when the user has no org
memberships. `getMemberWorkspaceId` catches that throw and returns `null`.

Consequence: a buyer who signs up via Clerk (no org) will have `operatorWorkspaceId
= null` in the payment-intent route. The `isOperator` check evaluates `false`
immediately. They cannot reach the operator bypass path regardless of what they
send in the request body.

The existing payment-intent route already handles this correctly for anonymous
callers. For signed-in buyers (Clerk account, no org), the path is identical to
anonymous — workspace is slug-resolved, operator bypass is skipped.

**No code change needed for this guarantee to hold.** It is structural, not
conditional. The risk is if Clerk "organizations required" is left ON — then a
buyer trying to create a Clerk account gets forced into org-creation, which would
then run `getOrCreateWorkspaceForUser` and auto-provision an operator workspace.
**This is the single highest-risk item (see below).**

---

## Post-purchase account-link

After a guest checkout completes (Stripe webhook fires `payment_intent.amount_capturable_updated`
or `payment_intent.succeeded`), the buyer may create a Clerk account to track
their tickets.

The account-link flow:

1. Buyer creates a Clerk account (no org invited).
2. On first sign-in to `/e/[slug]` (or a dedicated `/my-tickets` surface), the
   server calls:
   ```
   db.member.updateMany({
     where: {
       workspaceId: <slug-resolved>,
       email: <verified Clerk email>,
       clerkUserId: { startsWith: 'guest:' }, // only unlinked guests
     },
     data: { clerkUserId: userId },
   })
   ```
3. Future lookups by `{ workspaceId, clerkUserId }` will find the row directly.

**Constraint:** `updateMany` scoped by `{ workspaceId, email }` touches only that
workspace's rows. The buyer's Clerk userId cannot be written into any other
workspace's `Member` table without an explicit second purchase in that workspace.

**No schema change required** — `Member.clerkUserId` and `Member.email` exist.
The `@@unique([workspaceId, clerkUserId])` constraint prevents double-link within
one workspace.

---

## Cross-tenant access leak analysis

Every path through which a buyer could inadvertently gain access to another
tenant's data:

| Vector | Mitigation | Status |
|--------|-----------|--------|
| Buyer submits a different `workspaceId` in checkout body | `workspaceId` is NEVER taken from request body in public paths — always slug-resolved server-side | Safe |
| Buyer creates a Clerk org (via org invite or self-serve) | "organizations required" OFF prevents forced org creation; org invite is operator-controlled | Safe after Clerk config flip |
| Buyer's email matches a `Member` row in workspace B during account-link | `updateMany` scoped by `workspaceId` (slug-resolved from the purchase event) | Safe — different workspace not touched |
| `isOperator` bypass via crafted request to payment-intent | `operatorWorkspaceId` is null for no-org users; `isStaff(null, ...)` returns false | Safe |
| `requireRole` on `/api/operator/*` routes | `getMemberWorkspaceId` returns null for no-org users → 403 | Safe |
| Buyer guesses another event slug from a different workspace | DB query scoped `{ workspaceId, slug }` — slug alone doesn't leak cross-tenant | Safe |
| `getEffectiveRole` Clerk-org floor for a buyer | Floor requires `clerkOrgId` match on the workspace. Buyer has no org → no membership → `clerkOrgFloor` returns null | Safe |

---

## The single biggest risk — Warden must scrutinize

**Clerk "organizations required" setting.**

If this Clerk setting remains ON when the public surface launches, a buyer who
tries to create a Clerk account during/after checkout will be forced through
Clerk's org-creation flow. That triggers `getOrCreateWorkspaceForUser`, which
auto-provisions a new `Workspace` row with a fresh `clerkOrgId`. The buyer now has
an operator workspace. They will NOT be able to see any event data from NoBC's
workspace (their org is different), but:

- They now have a row in `Workspace` that is a valid operator workspace.
- If they navigate to `/operator`, `requireRole` resolves their workspace and they
  enter the operator dashboard with `READ_ONLY` effective role for their own empty
  workspace.
- This is not a data leak but IS an unintended surface exposure.

**Recommended fix (Adam must perform in Clerk dashboard before launch):**

In Clerk → Organization Settings → "Organizations required" → set to OFF.

This is a one-way config change. Do NOT implement any code that gates on this
setting — the config change is the fix, not a code guard.

**Secondary concern:** After setting OFF, existing operator users who navigate
to `/operator` must still have an org. Verify the Clerk setting change does not
retroactively remove existing org memberships. It should not — it only stops
forcing new users through org creation. Adam should verify with one test account
before launch.

---

## Anonymous payment path — current state (deliverable C)

The existing `POST /api/m/events/[slug]/access/payment-intent/route.ts` handles
anonymous callers correctly. Trace:

1. `const { userId } = await auth()` → `null` for no session.
2. `const operatorWorkspaceId = userId ? await getMemberWorkspaceId(userId) : null` → `null`.
3. `let workspaceId = operatorWorkspaceId` → `null`, so falls through to slug resolution:
   ```
   const evt = await db.event.findFirst({ where: { slug, status: 'PUBLISHED' }, select: { workspaceId: true } })
   workspaceId = evt?.workspaceId ?? null
   ```
4. `const member = userId ? ... : null` → `null`.
5. `resolveViewer(null, null)` → `"anon"`.
6. `loadAccessContext(workspaceId, evt.id, "anon")` → resolves guest path if `access.guest.enabled`.
7. `isOperator = false` (operatorWorkspaceId is null) → bypass skipped.
8. Guest branch: requires `body.guestEmail` + `body.guestName` → `findOrCreateGuestMember` → PaymentIntent.

**Gap found (resolved 2026-06-10):** `resolveViewer` in `lib/event-access.ts` maps `"anon"` as:
```ts
if (clerkUserId || member) return "guest"
return "anon"
```
`resolveAccessForViewer` handles `"anon"` the same as `"guest"` — it falls
through to the `access.guest.enabled` check. This works. No bug.

`"anon"` is NOT in the `ViewerKind` type union — the type is `"member" | "guest" |
"anon"`, but `resolveAccessForViewer` only has branches for `"member"` and then
falls through to the guest-enabled check. This is correct behavior for v1: an
anonymous visitor can purchase a guest ticket if `access.guest.enabled` is true.

**No code changes needed in the payment-intent route for anonymous checkout.**

**PROVEN: `/api/m/*` routes are NOT blocked for anonymous callers.** A live probe
(anonymous POST to `/api/m/events/e2e-stripe-ticket/access/payment-intent`) reached
the route handler and returned HTTP 400 — not 401. The middleware `isProtectedRoute`
matcher does NOT match `/api/m/(.*)`. Only UI routes under `/m(.*)` (no `/api/`
prefix) require Clerk session. The existing endpoint is fully reachable by anonymous
clients; a new public wrapper route is optional (rate-limiting / URL clarity only,
not a security requirement).

~~This IS a gap. An anonymous caller to the payment-intent route will hit
`auth.protect()` from the middleware and receive a 401/redirect before the handler
runs.~~ **RETRACTED — proven false by live probe.**

~~Option (a) is strongly preferred. The new public page at `/e/[slug]` should call
a new API route at `/api/e/[slug]/payment-intent` (or `/api/public/events/[slug]/
payment-intent`) that is structurally outside the `/m(.*)` protection.~~ **RETRACTED.**

The existing `POST /api/m/events/[slug]/access/payment-intent` is reusable as-is
for the public checkout surface. A dedicated `/api/e/[slug]/payment-intent` wrapper
remains optional — useful only if rate-limiting semantics should differ between
member-session and public-anonymous callers.

---

## What is deferred pending Warden review

1. The Clerk "organizations required" config change — Adam must flip in Clerk
   dashboard before any buyer-facing surface launches.
2. ~~The public API route for payment-intent (new path outside `/m(.*)`)~~ —
   **RESOLVED: no new route required.** `/api/m/events/[slug]/access/payment-intent`
   is reachable anonymously (proven by live probe 2026-06-10). A `/api/e/...`
   wrapper is optional (rate-limiting / clarity), not a security prerequisite.
3. The post-purchase account-link implementation — `Member.clerkUserId` update
   on buyer sign-in. Safe schema-wise; needs Warden sign-off on the `updateMany`
   scope guard.
4. Rate limiting on the public payment-intent endpoint — not in scope for backend
   contract lock but must be added before launch (Warden scope).

---

*Last updated: 2026-06-10*
