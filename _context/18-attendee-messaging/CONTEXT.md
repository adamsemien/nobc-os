# Stage 18 — Attendee Messaging (Blast)

> One-off operator blasts (email or SMS) to ONE event's confirmed attendees — consent-gated, suppressed, logged, dry-run-first. Post-purchase attendee messaging, deliberately NOT a marketing automation platform.

## Status

| Field | Value |
|---|---|
| **State** | 🟡 Built on `feat/event-builder-rebuild` (Adam's 2026-07-02 directive, Phase 4) — unmerged like the rest of the branch |
| **V1 item** | None — post-July-11 platform work |
| **Last updated** | 2026-07-03 |
| **Owner** | Adam |
| **Blocked on** | Adam's review + merge of the rebuild branch. SMS channel additionally needs `MARKETING_TWILIO_PHONE_NUMBER` (+ `TWILIO_*`) in Vercel — until then the SMS surface renders disabled with honest copy. |
| **Next** | Adam reviews the branch; on merge, set `MARKETING_TWILIO_PHONE_NUMBER` to take SMS blasts live. Explicitly deferred (out of scope by directive): scheduled/recurring sends, segments beyond one event's attendees, a templates editor, two-way threading into blasts, No Bad Blast (personal iMessage — separate system). |

## Scope

Compose → mandatory dry run (exact per-person consent verdicts + skip reasons) → confirm with honest counts → send, for one event's CONFIRMED attendees, one channel per blast. Per-recipient outcomes persisted. Responsibility ends at one-off sends: no scheduling, no segments, no templates.

## Files in play

```
prisma/schema.prisma                          ← Blast, BlastRecipient, SuppressedContact + 3 enums (end of file)
prisma/sql/attendee-blast.sql                 ← reviewed additive migration (applied to ep-sweet-term)
lib/blast/consent.ts                          ← CHANNEL-axis consent verdicts (profile + application fallback)
lib/blast/recipients.ts                       ← the resolution the dry run AND the send share
lib/blast/run.ts                              ← the engine: idempotent create/fire, retries, pacing, inbox logging
lib/email.ts                                  ← sendBlastEmail (locked FROM)
lib/twilio.ts                                 ← marketingSmsConfigured + sendMarketingSms (MARKETING number only)
app/api/operator/events/[id]/blast/           ← GET config, POST send; dry-run/ POST
app/operator/events/[id]/_components/EventMessagesTab.tsx ← the compose surface (Messages tab)
tests/unit/blast/blast.db.test.ts             ← acceptance on real rows
```

## Inputs

- Operator compose (channel, subject, body) + the literal `confirm: true` flag
- Confirmed RSVPs of one event (members + guest buyers)
- Consent: `Member.marketingEmailOptIn` / `marketingSmsOptIn`, falling back to the member's LATEST Application (`emailOptIn` / `smsOptInAt IS NOT NULL`) for pre-rebuild applicants
- `SuppressedContact` (per-workspace do-not-contact list)
- Env: `MARKETING_TWILIO_PHONE_NUMBER` (+ existing `TWILIO_*`, `RESEND_API_KEY`)

## Outputs

- `Blast` + `BlastRecipient` rows (the delivery record; per-recipient status, consent source, provider id, error)
- Email sends from the locked FROM; SMS sends from the marketing number at 1 msg/sec with STOP copy guaranteed
- Every blast SMS logged to the House Phone inbox (`SmsConversation` upsert + OUTBOUND `SmsMessage`, category `marketing`)
- `blast.sent` audit event; Twilio 21610 refusals auto-populate the suppression list

## Rules — DO NOT VIOLATE

1. **ACCESS never touches CHANNEL.** `redListed`/RedList is never read anywhere in this stage — a red-listed but consented attendee receives the blast. Asserted by test.
2. **The dry run is mandatory and server-enforced**: the send refuses when `expectedRecipients` no longer matches the live resolution.
3. **AI never composes-and-sends.** No agent surface reaches these routes; any future one proposes drafts only — `confirm: true` is the human's flag, same as publish.
4. **SMS sends from `MARKETING_TWILIO_PHONE_NUMBER` only** — the conversational House Phone number is never a blast sender. Unset → disabled surface, never a crash.
5. **No silent caps.** SMS blasts refuse over 200 recipients with honest copy (in-request 1 msg/sec pacing bounds the run); nothing is dropped quietly.
6. **Double-submit fires once**: clientToken idempotency + the DRAFT→SENDING claim. Race-tested.
7. **The rate limit is durable**: 4 blasts per event per hour, counted from Blast rows, not memory.
8. **Do not add `twilioSid` to `SmsMessage` in schema.prisma** — the column exists in the live DB only; Prisma writes leave it NULL (documented landmine, comment at the write site).

## What this stage does NOT own

- **14-house-phone** owns conversational SMS (inbox UI, replies, the Railway inbound service — `nobc-house-phone/` is read-only reference)
- **02-approval / 01-apply** own where consent is COLLECTED; this stage only reads it
- **05-payments** owns the purchase confirmation email path
- No Bad Blast (personal iMessage) is a separate system — untouched
