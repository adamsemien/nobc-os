# Stage 04 — Access

> Event Access submission across all access modes, approval-required handling, capacity enforcement, waitlist + auto-promotion. (The internal schema model is still named `RSVP`; the product-facing term is **Access** / **Event Access**.)

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #7, #8, #14 (waitlist auto-promote portion), #21 (comp tickets — issuance + member-facing flow) |
| **Last updated** | 2026-06-16 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | **2026-06-16: overnight email harden (branch `chore/overnight-harden-2026-06-15`, NOT merged).** GuestAccessConfirmation now renders event date/time in Central (`America/Chicago`); it previously had no timezone and rendered raw UTC on Vercel, so an evening event showed as next-day "1:00 AM". Em dashes removed from all email copy (brand rule). See `_context/_audit/EMAIL-SENDER-AUDIT-2026-06-16.md`. tsc + next build + 495 unit tests green. Earlier: **2026-06-15 — email-QR render fix (same branch, NOT merged).** Confirmation/comp emails embedded the QR as a `data:image/png;base64` URI, which Gmail AND Outlook both refuse to render (the `/confirmed` page works because a browser renders data: URIs). Fix: new PUBLIC route `app/api/qr/[id]/route.ts` serves the QR PNG over HTTPS (keyed by rsvpId → `member.memberQrCode`, fail-closed 404); `rsvpConfirmedEmail`/`compTicketEmail` now reference `<img src="${appUrl}/api/qr/[rsvpId]">` and stopped computing data URIs; the three senders (`webhooks/nobc/stripe`, `operator/events/[id]/comp`, agent `comp-ticket`) drop their `QRCode.toDataURL` calls; template fallback hardened `thenobadcompany.com` → `app.thenobadcompany.com` (the domain that hosts /api/qr). **Extended (approved) to the formerly-orphaned public /e/ path** — `emails/GuestAccessConfirmation.tsx` + `app/api/e/[slug]/access/submit/route.ts` now use the same hosted-QR pattern (takes `rsvpId` + `qrAvailable` boolean), so **NO `data:` URI QR remains anywhere in the codebase**. Cache dialed to `public, max-age=86400` (1-day; revocation headroom vs the original year-long immutable). **Known pre-scale items (LOW, left as-is):** `/api/qr` has no rate limit (one `findUnique` per request; email proxies cache after first hit), and the rsvpId travels in the URL (acceptable — same QR value already exposed by the `/confirmed` link in the email; high-entropy cuid; PNG-only response). No schema change. `tsc` + `next build` + ticket-confirmation unit tests (15/15) green. Next action: Adam verifies Vercel **Production** `NEXT_PUBLIC_APP_URL=https://app.thenobadcompany.com`, then manual email render test in Gmail/Outlook/Apple Mail + door scan, then review/merge. — Prior: **2026-06-15 — guest event-link fix (branch `fix-guest-event-link`, NOT merged).** Root cause: every operator share/preview/canonical link emitted the Clerk-gated `/m/events/[slug]` member surface, so signed-out guests hit a login wall; the public anon page `/e/[slug]` (built end-to-end — `assemblePublicEventDTO` + `PublicEventShell`; both `/api/m/.../access/*` routes already carry an anon-guest slug→workspace fallback) was orphaned, linked from nowhere. Repointed 4 operator-facing links to `/e/[slug]`: Copy Invite Link, the preview link (relabeled "Preview Public Page"), and the canonical-URL display in event settings + new-event. Member-facing links/emails/Stripe-return URLs intentionally left on `/m/events/`. Deferred (offered, declined for now): make anon `/m/events/[slug]` redirect to `/e/[slug]` to rescue links already shared. Next action: review + merge `fix-guest-event-link`. — Then: Review + merge PR #67, then the flagged follow-up: route-level transactional seat-hold for `/api/m/events/[slug]/access/{submit,payment-intent}` (their `hasCapacity()` check is still separate from the RSVP write; the paid path interleaves a Stripe call). **2026-06-09: capacity/waitlist counters made transactional (PR #67, branch `fix/transactional-capacity-waitlist`, NOT merged).** Audit race fix: capacity count + waitlist insert + RSVP create now run in one `db.$transaction` serialized by an Event row lock (`SELECT … FOR UPDATE`) in `lib/rsvp-submit.ts` + `lib/apply-event-rsvp.ts`; `promoteFromWaitlist` claims atomically under the same lock (email outside the tx); `cancelRsvp` flips via conditional `updateMany` so double-cancel can't promote two people for one freed seat. 22 new tests (`tests/unit/waitlist-promote.test.ts`, `tests/unit/rsvp-capacity.test.ts`) pin lock-before-count ordering, same-tx writes, distinct claims, idempotent cancel, plus-one rules. Also noted: `app/api/rsvp/plus-one/route.ts` does no capacity check at all (plus-ones bypass capacity) — left as-is, may be intentional. Access-gate decision-layer tests live in PR #64 (`tests/unit/event-access.test.ts` — overlaps PR #52's same-named file; merge #52 first, then reconcile). (2026-05-23: **operator access bypass + preview** — an operator can complete the access flow on behalf of a guest and preview it, for both **free** and **paid** events (`app/api/m/events/[slug]/access/{submit,payment-intent}/route.ts` + `EventAccessFlow.tsx` + `lib/event-access-submit.ts`). 2026-05-22: **guest-flow fix** — a signed-in non-member is no longer blocked from the guest flow; the over-restrictive member check was removed from both access routes. Non-member buyers now also mint a `memberQrCode` so the door scan works — see `06-wallet-checkin`. 2026-05-21: member events **calendar** `app/m/events/_components/MemberEventsExplorer.tsx` brought onto the ivory editorial brand system; the warm access-state copy in `RsvpCard.tsx` is part of the 2026-05-24 event-page redesign (Stage 03). Access-mode badge shows display labels ("Open"/"Ticketed"), never the raw enum.) |

> **Architecture note (2026-05-20):** `apply_or_pay` was removed as a standalone `AccessMode` enum value. It was not a real third mode — it is now expressed as `TICKETED` + `approvalRequired: true`. Migration `20260520000000_remove_apply_or_pay` applied. The `applyMode` column and `EventApplyMode` enum were dropped entirely. Workflow template key renamed `apply_or_pay` → `ticketed_approval`.

## Scope

Everything from a member clicking "RSVP" on an event to a confirmed RSVP row. Handles:
- Two composable access modes: `OPEN` and `TICKETED`
- `approvalRequired` toggle (operator approves each RSVP before confirmation)
- Capacity enforcement
- Waitlist queue
- Auto-promotion from waitlist when capacity opens (cancellation, refund, capacity raise)
- Custom question answers captured at RSVP time
- Plus-ones add-ons

## Files in play

```
app/m/events/[slug]/_components/EventAccessFlow.tsx  ← access flow UI (no separate `/rsvp` page — the flow renders inside the event-detail page)
app/m/events/[slug]/_components/EventAccessFlow.tsx ← member/guest access flow UI (+ operator bypass/preview entry)
app/api/m/events/[slug]/access/submit/route.ts  ← access submit (free path; guest-flow fix + operator bypass)
app/api/m/events/[slug]/access/payment-intent/route.ts ← paid access PaymentIntent (guest-flow fix + operator paid bypass)
lib/event-access-submit.ts                      ← shared access-submit logic; findOrCreateGuestMember mints memberQrCode
lib/rsvp-submit.ts                              ← member RSVP submit; transactional capacity gate + waitlist join (PR #67)
lib/waitlist.ts                                 ← waitlist auto-promote (atomic claim) + idempotent cancelRsvp (PR #67)
lib/apply-event-rsvp.ts                         ← apply-linked held seat; transactional capacity gate (PR #67)
tests/unit/waitlist-promote.test.ts             ← race contracts: atomic claim, email outside tx, idempotent cancel
tests/unit/rsvp-capacity.test.ts                ← race contracts: lock-before-count, same-tx writes, plus-one rules
app/api/rsvp/route.ts                           ← create RSVP
app/api/rsvp/[id]/route.ts                      ← read/cancel
app/api/operator/rsvps/[id]/approve/route.ts    ← operator approve (if required)
app/api/operator/rsvps/[id]/reject/route.ts     ← operator reject
app/api/operator/rsvps/[id]/cancel/route.ts     ← operator cancel
app/api/operator/rsvps/[id]/refund/route.ts     ← operator refund (ADMIN-gated)
app/api/operator/events/[id]/rsvps/route.ts     ← operator RSVP list for an event (renders inside `/operator/events/[id]`, no standalone `/rsvps` page)
# capacity check + waitlist enqueue/promote happens inline in lib/event-access-submit.ts above; no separate lib/rsvp/ modules
app/api/m/profile/route.ts                      ← member profile read/update (used during Access flow)
app/api/m/rsvps/route.ts                        ← member-facing list of their own Access entries
app/e/[slug]/page.tsx                           ← PUBLIC (anon) event page — guest-shareable; reuses EventDetail via PublicEventShell
lib/public-event-loader.ts                      ← anon DTO + slug→workspace resolve backing the public surface
app/operator/events/[id]/_components/CopyInviteLinkButton.tsx ← "Copy Invite Link" → emits /e/[slug] (2026-06-15 guest-link fix)
app/operator/events/[id]/page.tsx               ← operator "Preview Public Page" link → /e/[slug] (2026-06-15)
app/operator/events/[id]/_components/EventSettingsTab.tsx ← canonical-URL display → /e/[slug] (2026-06-15)
app/operator/events/new/page.tsx                ← new-event slug preview → /e/[slug] (2026-06-15)
app/api/qr/[id]/route.ts                         ← PUBLIC PNG QR endpoint; rsvpId → member.memberQrCode → QRCode.toBuffer; fail-closed 404; Cache-Control public,max-age=86400 (1-day, revocation headroom); fixes broken data-URI QR in Gmail/Outlook (2026-06-15 email-QR fix)
lib/email-templates.ts                           ← rsvpConfirmedEmail/compTicketEmail now embed <img src="${appUrl}/api/qr/[rsvpId]"> (hosted, not data: URI); fallback hardened to app.thenobadcompany.com (2026-06-15)
emails/GuestAccessConfirmation.tsx               ← public /e/ guest-access email; now embeds hosted <img src="${appUrl}/api/qr/[rsvpId]"> (was a data: URI); takes rsvpId + qrAvailable boolean (2026-06-15)
app/api/e/[slug]/access/submit/route.ts          ← public /e/ access submit (currently ORPHANED — no client fetches /api/e/*); dropped QRCode.toDataURL, passes rsvpId + qrAvailable to GuestAccessConfirmation (2026-06-15)
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
   - `OPEN`: confirm immediately (subject to capacity)
   - `TICKETED`: confirm only after Stripe authorize succeeds
   - `TICKETED` + `approvalRequired: true`: members apply (wait for approval) OR pay non-member price to skip the queue
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
