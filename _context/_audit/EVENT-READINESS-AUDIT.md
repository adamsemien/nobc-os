# Event Readiness Audit — NoBC OS
**Audit date:** 2026-06-12  
**Auditor:** Proof (read-only, no code changes)  
**Target event:** June 20  
**Branch:** main @ PR #101  
**Scope:** Event creation → registration → Stripe money path → check-in → operator fallbacks

---

## Summary Table

| Severity | Count | Files |
|----------|-------|-------|
| **P0** — will break the event / lose or mischarge money | **4** | Guest PI route, create-payment-intent route, promote-waitlist route, Stripe webhook |
| **P1** — likely to bite under real load / real input | **5** | Approve route, plus-one route, capture route, CHECKIN_SECRET UI, comp route |
| **P2** — polish / non-blocking | **3** | Terminology, hex literals, missing alert |
| **Total** | **12** | |

---

## Top 5 Things to Fix Before the 20th

1. **F1** — Guest `payment-intent` route oversell race (public `/e/[slug]` path, no serializable transaction)
2. **F2** — Legacy `create-payment-intent` route has no idempotency key and no transaction
3. **F3** — `promote-waitlist` has no capacity check and no transaction (operator day-of tool)
4. **F7** — `/api/stripe/capture` lacks operator role gate — any authenticated member can self-capture
5. **F6** — `plus-one` route has no capacity check at all

---

## P0 Findings

### F1 — Guest payment-intent route: capacity race / oversell on last seat

**File:** `app/api/e/[slug]/access/payment-intent/route.ts:130, 185-201`  
**Test coverage:** NOT COVERED

**What's wrong:**  
`hasCapacity()` is called on the plain `db` client (line 130), then a Stripe PaymentIntent is created via network I/O (~150ms), then `db.rSVP.create()` runs outside any transaction (line 185-201). Two concurrent guest checkouts both pass `hasCapacity()`, both create PIs in Stripe, both create RSVPs — the last spot sells twice.

The member-portal route (`/api/m/events/[slug]/access/payment-intent`) correctly wraps the RSVP create in `db.$transaction({ isolationLevel: 'Serializable' })` with an in-transaction capacity re-check that cancels the dangling PI on FULL. The guest public route is missing this entirely.

This is the highest-risk gap because the June 20 event will likely be reached via the public `/e/[slug]` link by guest ticket buyers.

**Fix:**
```typescript
// After stripe.paymentIntents.create(), replace plain db.rSVP.create() with:
try {
  created = await db.$transaction(
    async (tx) => {
      if (event.capacity) {
        const taken = await tx.rSVP.count({
          where: { workspaceId, eventId: evt.id, ticketStatus: { in: ['confirmed', 'held'] } },
        });
        if (taken >= event.capacity) {
          throw Object.assign(new Error('Event is full'), { code: 'FULL' });
        }
      }
      return tx.rSVP.create({ data: { ... } });
    },
    { isolationLevel: 'Serializable' },
  );
} catch (err) {
  if ((err as { code?: string }).code === 'FULL') {
    await stripe.paymentIntents.cancel(pi.id).catch(() => {});
    return NextResponse.json({ error: 'Event is full' }, { status: 409 });
  }
  throw err;
}
```

---

### F2 — `/api/stripe/create-payment-intent`: no idempotency key, no serializable transaction

**File:** `app/api/stripe/create-payment-intent/route.ts:66-70, 107-124`  
**Test coverage:** NOT COVERED

**What's wrong:**  
Two distinct problems in this legacy route:

1. **No idempotency key** on `stripe.paymentIntents.create()`. The newer member route passes `{ idempotencyKey: \`pi-${workspaceId}-${evt.id}-${rsvpMember.id}\` }`. If a user double-clicks or a network retry fires, two Stripe PIs are created for the same slot — only one gets stored, the other leaks (a dangling authorized hold on the guest's card until it expires in 7 days).

2. **Non-transactional capacity gate**: count check (line 66-70) then PI creation then RSVP write (line 107-124) — plain sequential calls. Two concurrent requests can both pass the count check.

**Fix:** Add idempotency key. Wrap count + RSVP write in `$transaction(Serializable)` with in-transaction re-check, matching `app/api/m/events/[slug]/access/payment-intent/route.ts`.

---

### F3 — `promote-waitlist` route: no capacity check, no transaction

**File:** `app/api/operator/events/[id]/promote-waitlist/route.ts:16-32`  
**Test coverage:** `waitlist-promote.test.ts` covers `lib/waitlist.ts` auto-promotion — NOT this API route

**What's wrong:**  
The route does `findFirst(WAITLISTED)` then `update()` to CONFIRMED with no capacity check and no transaction. Two paths to oversell:

1. Operator clicks "Promote from waitlist" twice quickly — both requests find the same next waitlist entry (same `WAITLISTED` order), both update to `CONFIRMED`, two people confirmed for one seat.
2. Event is already at capacity due to comps (F9) — operator promotes anyway, pushing past limit.

This is the primary day-of event tool used from the Room view. It will be clicked under time pressure.

**Fix:**
```typescript
// Wrap in a transaction:
await db.$transaction(async (tx) => {
  const ev = await tx.event.findFirst({ where: { id: eventId, workspaceId }, select: { capacity: true } });
  if (ev?.capacity) {
    const taken = await tx.rSVP.count({
      where: { workspaceId, eventId, ticketStatus: { in: ['confirmed', 'held'] } },
    });
    if (taken >= ev.capacity) throw Object.assign(new Error('full'), { code: 'FULL' });
  }
  const next = await tx.rSVP.findFirst({
    where: { workspaceId, eventId, status: 'WAITLISTED' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!next) throw Object.assign(new Error('empty'), { code: 'EMPTY' });
  return tx.rSVP.update({ where: { id: next.id }, data: { status: 'CONFIRMED', ticketStatus: 'confirmed' } });
});
```

---

### F4 — Stripe webhook: `payment_intent.payment_failed` / `canceled` does not trigger waitlist auto-promote

**File:** `app/api/webhooks/nobc/stripe/route.ts` (payment_intent.payment_failed case, ~line 185-210)  
**Test coverage:** NOT COVERED

**What's wrong:**  
When a card declines or a PI is canceled, the webhook correctly marks the RSVP as `payment_failed` / `DECLINED` — freeing the slot. However, there is no call to auto-promote the next waitlisted person. On a full event this means:

- Guest registers → card declines → RSVP marked failed → seat reopens → no one is notified
- Next person on waitlist waits indefinitely until an operator manually promotes from the Room view
- Operator may not notice until they see an empty seat at the door

No `alert()` is fired on this path either (other webhook paths fire `void alert(...)`), so the failure is completely silent.

**Fix (minimum):** Add `void alert({ severity: 'warning', event: 'stripe.payment_failed', ... })` on the `payment_intent.payment_failed` case so operators get notified.

**Fix (ideal):** Import and call the waitlist auto-promote logic from `lib/waitlist.ts` after marking the RSVP failed, identical to how `cancelRsvp` triggers promotion.

---

## P1 Findings

### F5 — Operator approve route: capacity check is not transactional

**File:** `app/api/operator/rsvps/[id]/approve/route.ts:24-42`  
**Test coverage:** NOT COVERED for concurrent approval race

**What's wrong:** Count check (line 30-37) and update (line 42) are separate non-transactional calls. If two operators approve two pending applications simultaneously when one seat remains, both see `taken < capacity`, both update to `CONFIRMED`. Low probability but realistic during a morning-rush approval session before a popular event.

**Fix:** Wrap `count` + `update` in `$transaction(Serializable)`.

---

### F6 — `plus-one` route: no capacity check

**File:** `app/api/rsvp/plus-one/route.ts` (no capacity check anywhere in handler)  
**Test coverage:** NOT COVERED for plus-one against a full event

**What's wrong:** A member can add a plus-one even when the event is at capacity. The plus-one creates a new RSVP with `ticketStatus: confirmed` + `status: CONFIRMED` — it counts against capacity after the fact. No check against `event.capacity` exists. On a tight-capacity event with a waitlist this silently oversells.

**Fix:** After the event lookup, add:
```typescript
if (event.capacity) {
  const taken = await db.rSVP.count({
    where: { workspaceId, eventId, ticketStatus: { in: ['confirmed', 'held'] } },
  });
  if (taken >= event.capacity) {
    return NextResponse.json({ error: 'Event is full' }, { status: 409 });
  }
}
```

---

### F7 — `/api/stripe/capture`: no operator role gate — any authenticated member can self-capture

**File:** `app/api/stripe/capture/route.ts:14-17`  
**Test coverage:** NOT COVERED

**What's wrong:** Auth is `auth()` + `requireWorkspaceId(userId)` (Clerk-org-derived). There is no `requireRole` check. Any authenticated org member — including `READ_ONLY` members — can POST to this endpoint. A member who knows their `rsvpId` can trigger early capture of their own held payment, bypassing the operator approval gate for apply-required ticketed events (where capture is supposed to happen only after operator approval).

The `/api/stripe/refund` route correctly uses `requireRole(OperatorRole.ADMIN)`. Capture should use at minimum `requireRole(OperatorRole.STAFF)`.

**Fix:**
```typescript
// Replace:
const { userId } = await auth();
if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const workspaceId = await requireWorkspaceId(userId);

// With:
const gate = await requireRole(OperatorRole.STAFF);
if (!gate.ok) return gate.response;
const { userId, workspaceId } = gate;
```

---

### F8 — `CHECKIN_SECRET` unset: fail-closed behavior correct but no operator warning in UI

**File:** `app/check-in/[slug]/page.tsx`, `lib/check-in-token.ts`  
**Test coverage:** `check-in-token.test.ts` covers fail-closed logic correctly

**What's wrong:** `mintCheckInToken()` returns `null` if `CHECKIN_SECRET` is unset. Fail-closed is correct and verified by tests. However if the secret is not set in Vercel:
- The operator navigates to the check-in page
- The page receives a null token
- The PWA likely shows an error or fails silently to load the event list
- Staff at the door on June 20 have no working scanner

CLAUDE.md notes `CHECKIN_SECRET` as optional but does not confirm it is set in Vercel. This needs verification before the event.

**Fix (immediate):** Confirm `CHECKIN_SECRET` is set in Vercel production environment.  
**Fix (code):** Add a server-side check in `app/check-in/[slug]/page.tsx` that renders a visible "Check-in not configured — contact your administrator" message if `mintCheckInToken` returns null, rather than letting the client-side fail silently.

---

### F9 — Comp ticket route: skips capacity check entirely

**File:** `app/api/operator/events/[id]/comp/route.ts:55-80`  
**Test coverage:** `access-comp-ticket.spec.ts` (E2E) — happy path only

**What's wrong:** `findFirst` (duplicate RSVP check) → `db.rSVP.create` with no capacity read. An operator can comp-issue seats past the event capacity limit. The member route's operator bypass path in `payment-intent` does check `hasCapacity`. This inconsistency means an operator issuing last-minute comps on event day could push the guest list over capacity without any warning.

**Fix:** Add capacity check before `db.rSVP.create`. If intentionally bypassing capacity (operator privilege), add an explicit code comment and consider a response field `{ ok: true, rsvpId, capacityOverridden: true }` so the UI can warn.

---

## P2 Findings

### F10 — "RSVP" used in member-facing portal UI — terminology law violation

**Files:**  
- `app/m/(portal)/page.tsx:206` — renders `RSVP →` as a link label  
- `app/m/(portal)/page.tsx:222,225,238` — section header "Your RSVPs", link `/m/rsvps`, empty state "No RSVPs yet"  
- `app/m/(portal)/help/page.tsx:15,27` — FAQ uses "RSVP" twice  

**What's wrong:** CLAUDE.md terminology law: "The user-facing concept is 'Access' / 'Event Access' — NEVER 'RSVP' in operator UI or member-facing copy."

**Fix:** `RSVP →` → `View →`; `Your RSVPs` → `Your Registrations`; `No RSVPs yet` → `No registrations yet`. Help FAQ: replace "RSVP" with "register" / "register for an event".

**Test coverage:** NOT COVERED (no UI copy tests).

---

### F11 — Hex literals in `CheckInClient.tsx` (event-day critical surface)

**File:** `app/check-in/[slug]/_components/CheckInClient.tsx:249-311`

**What's wrong:** Scan result feedback colors (`#1f7a44` success, `#9a6a00` already-checked-in, `#a32b2b` error) and full PWA chrome (`#0a0a0a` background, `#f5f5f5` foreground, `#888`, `#222`, `#333`, `#161616`) are hardcoded hex. Violates "no hex literals in components" rule. Not blocking for June 20 on a single-tenant event, but will break white-label theming for future tenants.

**Fix:** Replace with CSS variable semantic tokens. Low urgency for June 20.

**Test coverage:** NOT COVERED.

---

### F12 — No `alert()` call on Stripe payment failure webhook — silent to operators

**File:** `app/api/webhooks/nobc/stripe/route.ts` (payment_intent.payment_failed case)

**What's wrong:** The `payment_intent.payment_failed` and `payment_intent.canceled` cases update the RSVP status but fire no `alert()`. Other webhook paths (capture, checkout completion) fire `void alert(...)` on failures. Operators have no real-time signal that a guest's card declined and a seat opened up on a full event.

**Fix:** Add `void alert({ severity: 'warning', event: 'stripe.payment_intent.failed', workspaceId: piWorkspaceId, context: { piId: pi.id, memberId: piMemberId } })` in the failure case.

**Test coverage:** NOT COVERED.

---

## What's Clean — Don't Change

These areas were audited and are solid:

- **Workspace scoping:** Every event, RSVP, Payment, and Member query is `workspaceId`-scoped throughout. No cross-tenant data leak found.
- **Stripe webhook signature verification** (`app/api/webhooks/nobc/stripe/route.ts`): `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` is called first; missing sig returns 400. Correct.
- **Check-in token security** (`lib/check-in-token.ts`): HMAC-SHA256, constant-time comparison, expiry enforced, fail-closed when `CHECKIN_SECRET` unset. Well-tested.
- **Guest confirmed page workspace scope** (`app/e/[slug]/confirmed/page.tsx`): F4 two-step resolve — slug → workspaceId server-side, then `rSVP.findFirst({ where: { id: rsvpId, workspaceId } })`. Cross-workspace rsvpId cannot resolve.
- **Member payment-intent route** (`/api/m/events/[slug]/access/payment-intent`): Has idempotency key, serializable transaction, dangling-PI cleanup on FULL. This is the correct pattern F1/F2 should match.
- **Comp ticket email:** All `from:` addresses use `team@thenobadcompany.com` — canonical address law respected across all routes audited.
- **memberQrCode generation:** `findOrCreateGuestMember` and `findOrCreateOperatorMember` both call `generateMemberQrCode()` on create — guest ticket buyers get a scannable QR at the door.
- **Check-in RSVP route scope check** (`app/api/check-in/[rsvpId]/route.ts`): Token scope vs RSVP workspace+event validated before write. Idempotent.
- **Refund route** (`app/api/stripe/refund/route.ts`): `requireRole(ADMIN)` + workspace-scoped RSVP lookup. Correct.
- **Walk-in route** (`app/api/check-in/walkin/route.ts`): Event+workspace derived from token scope only, not from request body. Correct.
- **`CHECKIN_SECRET` fail-closed** behavior confirmed by `check-in-token.test.ts` — token mint and verify both return null when secret is absent.

---

## Test Coverage Map (event-critical paths)

| Path | Has test | What's tested |
|------|----------|---------------|
| `/api/e/[slug]/access/payment-intent` | No | — |
| `/api/e/[slug]/access/submit` | Partial (E2E guest-checkout.spec.ts) | Happy path |
| `/api/m/events/[slug]/access/payment-intent` | No | — |
| `/api/m/events/[slug]/access/submit` | Partial (E2E access-*.spec.ts) | Happy paths |
| `/api/stripe/create-payment-intent` | No | — |
| `/api/stripe/capture` | No | — |
| `/api/stripe/refund` | No | — |
| `/api/webhooks/nobc/stripe` | No | — |
| `/api/operator/rsvps/[id]/approve` | Partial (E2E) | Happy path only |
| `/api/operator/events/[id]/promote-waitlist` | No | — |
| `/api/operator/events/[id]/comp` | Partial (E2E) | Happy path only |
| `/api/rsvp/plus-one` | No | — |
| `/api/check-in/[rsvpId]` | Partial (token unit) | Token crypto only |
| `lib/check-in-token.ts` | Yes | Full — mint, verify, tamper, expiry, fail-closed |
| `lib/waitlist.ts` auto-promote | Yes (`waitlist-promote.test.ts`) | Auto-promote logic |
| `lib/apply-event-rsvp.ts` capacity | Yes (`rsvp-capacity.test.ts`) | Serializable tx |
| Price integrity | Yes (`event-access-price-integrity.test.ts`) | $0 regression |

**Untested critical paths (no test at any layer):** guest payment-intent capacity race, create-payment-intent idempotency, capture auth gate, promote-waitlist capacity, plus-one capacity, Stripe webhook payment_failed → capacity release.
