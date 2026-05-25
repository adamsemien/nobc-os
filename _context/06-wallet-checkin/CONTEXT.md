# Stage 06 — Wallet + Check-in

> Apple Wallet + Google Wallet pass generation, offline-first QR check-in PWA, capture-on-check-in trigger.

## Status

| Field | Value |
|---|---|
| **State** | 🔶 Partial |
| **V1 item** | #11, #12 |
| **Last updated** | 2026-05-21 |
| **Owner** | Adam |
| **Blocked on** | `PASSNINJA_*` keys unset in Vercel (Apple/Google passes still 503; deferred). The QR-in-email + door-scan path no longer depends on PassNinja — it works via the plain `memberQrCode` QR. |
| **Next** | Set `PASSNINJA_*` in Vercel to light up native wallet passes, then re-introduce the (now removed) "Add to Wallet" buttons as POST forms (the 405 was not fixed — buttons were removed). Optional: one-time backfill `memberQrCode` for Members created before 2026-05-21 (see Fix applied note). |

## Scope

- Apple Wallet pass generation on RSVP confirm
- Google Wallet pass generation on RSVP confirm
- Pass revocation on refund or RSVP cancel
- Offline-first QR check-in PWA for staff at the door
- Capture trigger on successful check-in (calls stage 05)

## Files in play

```
app/api/wallet/apple/route.ts                   ← .pkpass generation
app/api/wallet/google/route.ts                  ← Google Wallet JWT
app/api/wallet/[rsvpId]/revoke/route.ts         ← pass revocation
app/check-in/page.tsx                           ← PWA scanner UI
app/check-in/[eventSlug]/page.tsx               ← event-specific scanner
app/api/check-in/scan/route.ts                  ← QR scan handler
app/api/check-in/event/route.ts                 ← event-context check-in (door staff workflow)
app/api/check-in/walkin/route.ts                ← walk-in check-in (no prior RSVP)
public/manifest.json                            ← PWA manifest
public/sw.js                                    ← service worker (offline)
lib/wallet/apple-pass.ts                        ← .pkpass builder
lib/wallet/google-pass.ts                       ← Google JWT builder
lib/check-in/qr.ts                              ← QR encode/decode
```

## Inputs

- RSVP confirmation (from stage 04) → trigger pass generation
- RSVP cancellation or refund → trigger pass revocation
- Staff member scanning a QR at the door

## Outputs

- `.pkpass` file or Google Wallet save URL delivered to member
- `RSVP.walletPassId` written
- `RSVP.checkedInAt` written on successful check-in
- Capture trigger fired to stage 05
- `AuditEvent` row for every check-in

## Rules — DO NOT VIOLATE

1. **PWA must function fully offline.** Door staff cannot rely on venue WiFi. Cache the guest list locally, sync on reconnect.
2. **QR codes are signed + workspace-scoped.** Use HMAC. A QR from another workspace must not validate.
3. **Check-in writes `AuditEvent` AND triggers Stripe capture** (if RSVP was a paid ticket). One transaction.
4. **Pass revocation on refund is mandatory.** No active passes for refunded RSVPs.
5. **Double check-in protection.** If `RSVP.checkedInAt` is already set, surface to staff with timestamp; do not silently re-check-in.
6. **Workspace-scoped.** Every endpoint checks workspace.
7. **PassNinja is the chosen vendor — use `@passninja/passninja-js` for both Apple and Google passes.** Do not roll our own `.pkpass` builder or Google Wallet JWT signer. PassNinja handles cert management, pass updates, and platform-specific quirks.

## Environment variables

> ⚠️ Audit 2026-05-21: the vars below were aspirational. The shipped code uses **PassNinja**, not raw Apple/Google certs. Authoritative list (matches root CLAUDE.md + `lib/wallet-pass.ts`):

- `PASSNINJA_API_KEY` — PassNinja API key (required by `lib/wallet-pass.ts`; `isPassNinjaConfigured()` false until set → routes 503)
- `PASSNINJA_ACCOUNT_ID` — required alongside the API key
- `PASSNINJA_PASS_TYPE` — pass-type slug (defaults `nobc.member`). Code reads `PASSNINJA_PASS_TYPE`, **not** `PASSNINJA_TEMPLATE_ID`.

The `APPLE_WALLET_*` / `GOOGLE_WALLET_*` / `CHECK_IN_QR_SECRET` vars listed in prior drafts are **not used anywhere in code** (no roll-your-own `.pkpass` builder or QR HMAC was ever shipped — QR is a plain `QRCode.toDataURL` of `memberQrCode`).

## Audit findings — ticket→QR delivery + The Room data (2026-05-21, code-verified, read-only)

**Audit traced Stripe purchase → event pass.** The webhook/email half lives in `05-payments`; QR/pass generation + the live check-in board ("The Room") are here.

### QR / wallet pass — what actually happens
- **Nothing is generated at purchase.** The Stripe webhook (`app/api/webhooks/nobc/stripe/route.ts`) only flips RSVP statuses and sends a link email — no QR, no `generateEventPass`.
- The **event QR is rendered on the fly** when the buyer opens the confirmed page: `app/m/events/[slug]/confirmed/page.tsx:87-92` — `QRCode.toDataURL(member.memberQrCode ?? rsvpId)`. Never persisted.
- `Member.memberQrCode` (`prisma/schema.prisma:128`, `@unique`) and the **member** PassNinja pass are minted only at **approval** (`lib/applications/approve.ts:31` via `randomBytes(8)`, pass at `:94`) — not at purchase.
- `generateEventPass(rsvpId)` (`lib/wallet-pass.ts:30`) is called from exactly one place — `app/api/wallet/apple/[rsvpId]/route.ts:54` — never from the webhook. 503s until `PASSNINJA_*` set.

### Three gaps (code-verified)
1. **QR not in the paid-purchase email.** `rsvpConfirmedEmail` (`lib/email-templates.ts:10-40`) sends only a text link to the confirmed page (`:35-36`). The comp path `compTicketEmail` (`:42-63`) DOES embed `<img src="${qrDataUrl}">` (`:59`). To wire: compute `qrDataUrl` in the webhook and call a QR-embedding template at both send sites (`app/api/webhooks/nobc/stripe/route.ts:74`, `:141`). Capability already exists for comps.
2. **Wallet buttons are broken — GET vs POST.** Confirmed page links passes with `<a href>` (GET): `confirmed/page.tsx:227` (apple), `:249` (google). Both routes export **POST only** (`app/api/wallet/apple/[rsvpId]/route.ts:7`, `app/api/wallet/google/[rsvpId]/route.ts:16`). Click → 405 even with keys set. Fix: add a GET export or POST from the page.
3. **QR value mismatches the scanner for non-member buyers.** Offline scanner matches strictly `memberQrCode === qrCode` (`app/check-in/[slug]/_components/CheckInClient.tsx:151`); the confirmed page falls back to `rsvpId` when `memberQrCode` is null. Buyers created by `getOrCreateMemberFromClerk` (`lib/clerk-member.ts`) get no `memberQrCode` → QR encodes `rsvpId` → "not found" at the door. Close by backfilling `memberQrCode` at purchase.

### Fix applied (2026-05-21) — scannable QR in the paid-purchase email
The three gaps above are resolved (gaps 1 + 3) or sidestepped (gap 2):
- **New shared helper `lib/member-qr.ts` → `generateMemberQrCode()`** (16 hex chars, the approval-era format). Every **production** Member-creation path now mints `memberQrCode` through it, so a buyer can always be scanned: `lib/clerk-member.ts` (the known hole), `lib/event-access-submit.ts` `findOrCreateGuestMember` (non-member buyers), `lib/apply-event-rsvp.ts`, `app/api/apply/membership/[id]/{approve,submit}/route.ts`, `app/api/rsvp/plus-one/route.ts`. The three paths that already minted inline (`lib/applications/approve.ts`, `lib/mcp/tools/applications.ts`, `lib/mcp/legacy-tools.ts`) were refactored onto the helper (single source). On upserts the QR is set on the **create** branch only, so re-approval never churns an existing token.
- **Gap 1 fixed:** `app/api/webhooks/nobc/stripe/route.ts` now computes `QRCode.toDataURL(member.memberQrCode)` at both `rsvpConfirmedEmail` send sites and `rsvpConfirmedEmail` (`lib/email-templates.ts`) embeds it as `<img>` (mirrors `compTicketEmail`); the confirmed-page link stays as the data-URI fallback.
- **Gap 3 fixed:** the embedded QR encodes `member.memberQrCode`, which is exactly what `CheckInClient.tsx:151` matches and what `app/api/check-in/event/route.ts:67` loads into the offline door DB → non-member buyers now pass the scan.
- **Gap 2 (wallet buttons):** the dead Apple/Google `<a>` buttons were **removed** from `app/m/events/[slug]/confirmed/page.tsx` (per task scope) — the 405 itself was NOT fixed and PassNinja code was untouched.
- **Not changed (no schema migration, by request):** `memberQrCode` field already existed. **Dev-only** member-creation paths (`app/api/dev/seed`, `app/api/dev/persona/*`) were intentionally left to preserve the deterministic-seed rule; `prisma/seed-demo.ts` already mints deterministically. **Edge case:** Members created *before* this change still have `memberQrCode = null` → their purchase email falls back to link-only and door scan fails until a one-time backfill (not done — no migration/script was requested).

### The Room (live check-in board) — query owned here, gate/seed elsewhere
- Route `/operator/events/[id]/room` → `app/operator/events/[id]/room/page.tsx` → `RoomDashboard.tsx` (polls `/room` every 10s, `/room/vibe` AI descriptor every 30 min) → data from `app/api/operator/events/[id]/room/route.ts`.
- A person appears in the room **iff their RSVP has `checkedIn: true`** (`route.ts:48-60`); waitlist requires `status: 'WAITLISTED'` (`:49,:61`). Archetype chips are a left-join on `Application.email` with `archetype: { not: null }` (`:79-87`) — a missing archetype drops the chip, not the person. VIP ✦ = `WatchList type PURPLE` email match (`:90-98`). All workspace-scoped.
- **Why the demo seed doesn't render it:** the *query* populates fine for any event with checked-in RSVPs — the blocker is upstream. See `07-operator-dashboard` (today-only dashboard gate hides the entry button) and `13-dev-tooling` (seeds create no today-event; dev-route checked-in members have no Application so chips blank).

### Corrections to the sections above (aspirational, never shipped under those names)
- Wallet routes are `app/api/wallet/apple/[rsvpId]/route.ts` and `.../google/[rsvpId]/route.ts` (not `/wallet/apple/route.ts`). Pass builder is a single `lib/wallet-pass.ts` (PassNinja SDK) — not `lib/wallet/apple-pass.ts` + `google-pass.ts`.
- Pass is **not** generated "on RSVP confirm" (as Scope/Inputs claim) — only on-demand and only at approval for the member-level pass.
- Output `RSVP.walletPassId` is inaccurate: `walletPassId`/`passIssuedAt` live on **`Member`** (`schema.prisma:129-130`); `Ticket.walletPassId` exists but `db.ticket.create` is never called (the RSVP is the ticket).

## What this stage does NOT own

- Access (RSVP) confirmation logic → `04-access/`
- Stripe capture mechanics + the confirmation email send → `05-payments/`
- Operator dashboard shell + the "Tonight" gate that surfaces The Room button → `07-operator-dashboard/`
- Demo seed that should populate The Room → `13-dev-tooling/`
- Wallet pass design templates (visual brand) → see Brand Dashboard reference doc
