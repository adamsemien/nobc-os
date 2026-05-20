# Stage 06 — Wallet + Check-in

> Apple Wallet + Google Wallet pass generation, offline-first QR check-in PWA, capture-on-check-in trigger.

## Status

| Field | Value |
|---|---|
| **State** | 🔶 Partial |
| **V1 item** | #11, #12 |
| **Last updated** | 2026-05-20 |
| **Owner** | Adam |
| **Blocked on** | Nothing (PassNinja was selected as the vendor — original blocker resolved) |
| **Next** | Complete PassNinja wallet pass generation and revocation flows |

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

- `APPLE_WALLET_CERT` / `APPLE_WALLET_CERT_PASSWORD` — pass signing cert
- `APPLE_WALLET_PASS_TYPE_ID` — registered with Apple
- `GOOGLE_WALLET_ISSUER_ID` / `GOOGLE_WALLET_PRIVATE_KEY` — Google service account
- `CHECK_IN_QR_SECRET` — HMAC secret for QR signing

## What this stage does NOT own

- Access (RSVP) confirmation logic → `04-access/`
- Stripe capture mechanics → `05-payments/`
- Operator-side check-in dashboard → `07-operator-dashboard/`
- Wallet pass design templates (visual brand) → see Brand Dashboard reference doc
