# Stage 04 — Access

> Event Access submission across all access modes, approval-required handling, capacity enforcement, waitlist + auto-promotion. (The internal schema model is still named `RSVP`; the product-facing term is **Access** / **Event Access**.)

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #7, #8, #14 (waitlist auto-promote portion) |
| **Last updated** | 2026-05-20 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | Polish + V1.5 enhancements |

## Scope

Everything from a member clicking "RSVP" on an event to a confirmed RSVP row. Handles:
- All three access modes (`open`, `ticketed`, `apply_or_pay`)
- `approvalRequired` toggle (operator approves each RSVP before confirmation)
- Capacity enforcement
- Waitlist queue
- Auto-promotion from waitlist when capacity opens (cancellation, refund, capacity raise)
- Custom question answers captured at RSVP time
- Plus-ones add-ons

## Files in play

```
app/m/events/[slug]/rsvp/page.tsx               ← RSVP flow UI
app/api/rsvp/route.ts                           ← create RSVP
app/api/rsvp/[id]/route.ts                      ← read/cancel
app/api/rsvp/[id]/approve/route.ts              ← operator approve (if required)
app/api/rsvp/[id]/reject/route.ts               ← operator reject
lib/rsvp/capacity.ts                            ← capacity decrement + waitlist promote
lib/rsvp/waitlist.ts                            ← FIFO promote logic
app/operator/events/[id]/rsvps/page.tsx         ← operator Access (RSVP) management
app/api/m/profile/route.ts                      ← member profile read/update (used during Access flow)
app/api/m/rsvps/route.ts                        ← member-facing list of their own Access entries
```

## Inputs

- Approved `Member` clicking RSVP on an `Event`
- Operator approve/reject action (if `Event.approvalRequired = true`)
- Event capacity changes (operator raises capacity → triggers waitlist promote)
- RSVP cancellation (frees a seat → triggers waitlist promote)

## Outputs

- `RSVP` row with status: `pending | confirmed | waitlisted | cancelled | rejected`
- For ticketed events: triggers Stripe authorize → stage 05
- Capacity decrement on Event
- `AuditEvent` for every status transition

## Schema fields

- **RSVP**: workspaceId, eventId, memberId, status, plusOnesCount, customAnswers (JSON), waitlistPosition, stripePaymentIntentId, walletPassId, checkedInAt, refundedAt — the schema name stays `RSVP` even though the product term is "Access"
- **WaitlistEntry**: structured waitlist position rows (back-reference to the RSVP they promoted from)
- Indexes: (eventId, status), (memberId, eventId) unique

## Rules — DO NOT VIOLATE

1. **Respect access mode.**
   - `open`: confirm immediately (subject to capacity)
   - `ticketed`: confirm only after Stripe authorize succeeds
   - `apply_or_pay`: free path needs operator approval; paid path skips it
2. **Capacity is atomic.** Use a DB transaction or row lock — never check-then-write. Two simultaneous RSVPs on the last seat must not both succeed.
3. **Waitlist auto-promote runs on every seat-opening event.** Cancellation, refund, capacity raise. Promote in FIFO order by `waitlistPosition`.
4. **`approvalRequired` overrides everything except waitlisting.** Even paid RSVPs need operator approval if the flag is set.
5. **Plus-ones consume capacity.** A member RSVPing +2 consumes 3 seats.
6. **Workspace-scoped.** Every query checks `workspaceId`.

## What this stage does NOT own

- Event creation / capacity field itself → `03-events/`
- Stripe authorize/capture/refund logic → `05-payments/`
- Wallet pass generation on confirm → `06-wallet-checkin/`
- Check-in at the door → `06-wallet-checkin/`
- Operator dashboard shell → `07-operator-dashboard/`
