# Public Checkout — Security Review

**Reviewer:** Warden  
**Date:** 2026-06-10  
**Branch:** `feat/public-checkout-backend` (PR #81)  
**Artifacts reviewed:** `PUBLIC-CHECKOUT-AUTH-MODEL.md`, `lib/public-event.ts`, `middleware.ts`, `lib/auth.ts`, `lib/operator-role.ts`, `app/api/m/events/[slug]/access/payment-intent/route.ts`, `lib/event-access-submit.ts`, `tests/unit/sponsor-firewall.test.ts`, `prisma/schema.prisma`, `app/operator/layout.tsx`, `app/operator/page.tsx`

---

## Verdict

**APPROVE-WITH-REQUIRED-CHANGES**

The structural identity model is sound. Two findings must be resolved before the Clerk flip or account-link implementation ships. One pre-existing issue is activated by the Clerk flip and must be patched at the same time. One multi-tenant structural gap must be acknowledged and tracked.

---

## Findings

### F1 — HIGH: Clerk "organizations required" must be flipped OFF before launch

**File:** Clerk dashboard (config, not code)

If Clerk "organizations required" remains ON when any buyer-facing surface launches, a buyer who creates a Clerk account during/after checkout is forced through Clerk's org-creation flow. That triggers `getOrCreateWorkspaceForUser`, which auto-provisions a `Workspace` row with a fresh `clerkOrgId`. The buyer now has an operator workspace. `getEffectiveRole` assigns them READ_ONLY floor via the Clerk-org floor path. They can reach `/operator` with an empty workspace.

This is not a data leak — they see only their own empty workspace. But it is unintended operator surface exposure and creates dirty `Workspace` rows.

**Fix:** Adam flips "organizations required" → OFF in the Clerk dashboard before any buyer-facing surface is deployed. No code change required. Verify the flip does not retroactively affect existing operator org memberships (it should not).

**This is a gate. Do not flip any buyer-facing switch until this is confirmed OFF.**

---

### F2 — MED: `/operator/layout.tsx` does not redirect no-workspace users; exposes operator shell

**File:** `app/operator/layout.tsx`

```ts
const workspaceId = (await getMemberWorkspaceId(userId)) ?? '';
```

No redirect when `workspaceId` is null/empty. The layout renders the full operator nav shell (`OperatorNav`, `AgentPanel`, `CommandPaletteProvider`, etc.) regardless. The root page (`app/operator/page.tsx`) calls `requireWorkspaceId(userId)`, which calls `getOrCreateWorkspaceForUser` and **throws** for a no-org user (no try/catch). Result:

1. Buyer (signed-in Clerk account, no org) navigates to `/operator`.
2. Middleware: `/operator(.*)` → `auth.protect()` → passes (buyer is signed in).
3. Layout runs: `workspaceId = ""` — no redirect — full operator nav shell renders.
4. Page runs: `requireWorkspaceId` throws → Next.js unhandled error / 500.

The buyer sees the operator navigation before the crash. No workspace data leaks (queries guard on truthy workspaceId), but the operator shell is an unintended surface.

This is a pre-existing gap, but it is dormant today because all signed-in users are operators (Clerk "organizations required" ON). The Clerk flip in F1 activates this path.

**Fix (spine implements before the Clerk flip):**

```ts
// app/operator/layout.tsx — add after getMemberWorkspaceId
const workspaceId = (await getMemberWorkspaceId(userId)) ?? '';
if (!workspaceId) redirect('/');
```

One line. Must land in the same deploy as the Clerk flip or before it.

---

### F3 — MED: Account-link lacks email-ownership verification — guest row hijack

**File:** `app/api/m/account-link/route.ts` (designed, not yet implemented)

The design's `updateMany` account-link:

```ts
db.member.updateMany({
  where: {
    workspaceId: <slug-resolved>,
    email: <verified Clerk email>,
    clerkUserId: { startsWith: 'guest:' },
  },
  data: { clerkUserId: userId },
})
```

Attack path:

1. Attacker submits `victim@example.com` as `guestEmail` at checkout. `findOrCreateGuestMember` creates a `Member` row keyed by `{ workspaceId, email: "victim@example.com" }`.
2. Victim later creates a Clerk account with `victim@example.com` (Clerk verifies the address).
3. Account-link fires. `email` matches. The attacker's purchase row is merged into the victim's account. The victim now "owns" the attacker's ticket.

The blast radius is limited — the attacker can't gain the victim's access, and the victim is not harmed unless they get confused by an unexpected ticket. The larger risk is email fraud: order confirmations and welcome emails go to `victim@example.com` at purchase time, which is abusive spam.

The `clerkUserId: { startsWith: 'guest:' }` guard in the design is correct and necessary — it prevents overwriting a row that already has a real Clerk ID. Keep it.

**Required guard (spine implements before account-link ships):**

When performing the account-link `updateMany`, confirm the email used for the update matches a **verified** email address on the Clerk user object:

```ts
// In the account-link route, before calling updateMany:
const clerkUser = await clerkClient().users.getUser(userId);
const verifiedEmails = clerkUser.emailAddresses
  .filter(e => e.verification?.status === 'verified')
  .map(e => e.emailAddress.toLowerCase());

if (!verifiedEmails.includes(normalizedEmail)) {
  return NextResponse.json({ error: 'Email not verified' }, { status: 403 });
}
```

Additionally, `findOrCreateGuestMember` in the payment-intent handler accepts `guestEmail` from the request body without format validation beyond Zod `z.string().email()`. Zod email validation is present (confirmed in `BodySchema`). Sufficient at checkout. The account-link guard above is the critical addition.

---

### F4 — MED: Slug is per-workspace unique, not globally unique — multi-tenant routing collision

**File:** `prisma/schema.prisma`, `lib/public-event.ts`

```
@@unique([workspaceId, slug])
```

Slug is unique per workspace, not globally. `buildPublicEventDTO` resolves workspace via:

```ts
db.event.findFirst({ where: { slug, status: 'PUBLISHED' } })
```

No workspace scope on this lookup. At single-tenant this is safe — there is only one workspace. At tenant #2, workspace A's `"summer-gala"` and workspace B's `"summer-gala"` collide. Whichever row `findFirst` returns wins — undefined behavior, not a security breach, but a routing correctness failure that could expose workspace B's event to workspace A's buyer traffic.

**Fix (before multi-tenant launch — not this PR):** The `/e/[slug]` surface must route via a workspace-scoped URL: `/e/[workspaceSlug]/[eventSlug]` or a subdomain pattern. The single-segment `/e/[slug]` is acceptable for single-tenant (NoBC is tenant zero) but the schema constraint and the `buildPublicEventDTO` lookup must both be updated before onboarding tenant #2.

**Track this.** `APPLY_DEFAULT_WORKSPACE_ID` env var precedent (PR #60) shows the team knows about multi-tenant scoping gaps. Same class of issue.

---

### F5 — LOW: No rate limiting on anonymous PaymentIntent minting

**File:** `app/api/m/events/[slug]/access/payment-intent/route.ts`

The route creates Stripe `PaymentIntent` objects for anonymous callers with no rate limit. Enables:
- Card testing / enumeration against this Stripe account (each PaymentIntent creation costs a Stripe API call and can be used to test stolen card numbers).
- Trivially automated to inflate `Member` / RSVP counts with garbage guest rows.

Not blocking for the design review, but **must be in place before the public checkout surface launches.** Recommended: Upstash Redis + `@upstash/ratelimit`, keyed by IP, limit 10 PaymentIntents per IP per hour. Add Cloudflare turnstile or hCaptcha on the checkout client if card testing remains a concern after rate limiting.

---

### F6 — LOW: `workspaceId` in `PublicEventDTO` is intentional but must be enforced read-only

**File:** `lib/public-event.ts`

`PublicEventDTO` includes `workspaceId` with the comment "needed so the checkout page can call `/api/e/[slug]/...` safely." This is fine — `workspaceId` is an opaque CUID with no intrinsic value to an attacker. **However:** every route at `/api/e/[slug]/...` (the not-yet-implemented public API) MUST resolve `workspaceId` from the slug server-side and ignore any `workspaceId` the caller sends. If any route trusts `body.workspaceId`, the DTO field becomes a cross-tenant injection vector. Confirmed: the existing payment-intent route does NOT take `workspaceId` from the request body. This pattern must be codified as a rule for the new public routes.

---

## What is clear

**F-CLEAR-1: Buyer → operator escalation is structurally blocked.**

- `getMemberWorkspaceId` returns null for no-org users. `requireRole` gates every `/api/operator/*` write at the 403 level. `getEffectiveRole` requires a matching `clerkOrgId`; a buyer has no org → `clerkOrgFloor` returns null → effective role null → denied. Cross-workspace operator bypass requires `operatorWorkspaceId === workspaceId`; a buyer's operatorWorkspaceId is null → `isOperator` is false. No code change needed for this property to hold.

**F-CLEAR-2: `PublicEventDTO` projection is a clean firewall.**

DB `select` is explicit. No `operator/*` fields. No `Member` relations. No psychographic fields (`MemberPsychographics`, `archetypeScores`, `tasteSignals`). `memberPriceCents` deliberately absent. `ticketTiers` filtered to `visibility: 'public'` and `manuallyClosed: false`. Tier `select` excludes `soldCount`/`heldCount` from the DTO (they are used to compute `available` but not forwarded). The projection is deliberate and correct.

**F-CLEAR-3: Draft/unpublished event enumeration is blocked.**

Both `buildPublicEventDTO` and the payment-intent route filter `status: 'PUBLISHED'`. A draft event slug returns null from `buildPublicEventDTO` and 404 from the payment-intent route. Enumerating published event slugs is acceptable — these are public by design.

**F-CLEAR-4: Account-link `updateMany` workspace scoping is correct as designed.**

`updateMany` scoped by `{ workspaceId: <slug-resolved>, email, clerkUserId: { startsWith: 'guest:' } }` cannot touch rows in other workspaces. The `@@unique([workspaceId, clerkUserId])` DB constraint prevents double-link. The workspace is slug-resolved server-side, never caller-supplied.

**F-CLEAR-5: `/api/m/` is not middleware-gated — anonymous access is correct and intentional.**

`createRouteMatcher(['/m(.*)'])` matches paths starting with `/m`, not `/api/m/`. The middleware runs for all `/api/*` paths (from `config.matcher`) but `auth.protect()` is only called when `isProtectedRoute` matches. `/api/m/events/[slug]/access/payment-intent` is NOT protected. Anonymous callers reach the route handler, which handles them correctly via the guest branch. This matches the design doc's "confirmed empirically" statement. No change needed.

---

## Required changes before implementation of irreversible auth pieces

In priority order — items 1 and 2 must ship before the Clerk flip; item 3 must ship before account-link is implemented:

1. **[Adam — Clerk dashboard]** Flip "organizations required" → OFF. Verify existing operator org memberships are unaffected. Confirm before any buyer-facing surface is deployed.

2. **[spine — code, one line]** Add `if (!workspaceId) redirect('/')` in `app/operator/layout.tsx` after the `getMemberWorkspaceId` call. Must land in the same deploy as the Clerk flip or before.

3. **[spine — account-link route]** When implementing the account-link `updateMany`, gate on Clerk-verified email: confirm `email` is in `clerkUser.emailAddresses` with `verification.status === 'verified'` before executing the update. The `clerkUserId: { startsWith: 'guest:' }` filter in the where-clause is also required and correct.

4. **[tracked, not blocking]** Slug global-uniqueness: `buildPublicEventDTO`'s `findFirst` needs workspace scoping before tenant #2 onboards. `/e/[workspaceSlug]/[eventSlug]` or subdomain routing resolves this.

5. **[pre-launch, not design-blocking]** Rate limit the anonymous PaymentIntent endpoint before the public checkout surface goes live.
