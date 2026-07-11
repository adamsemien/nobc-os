# Stage 18 — Attendee Messaging (Blast + lifecycle event-comms)

> One-off operator blasts (email or SMS) to ONE event's confirmed attendees — consent-gated, suppressed, logged, dry-run-first. Post-purchase attendee messaging, deliberately NOT a marketing automation platform. Since 2026-07-10 this stage also holds the deterministic **lifecycle event-comms layer** (email-only): registration confirmation, pre-event reminder, day-of reminder, post-event follow-up.

## Status

| Field | Value |
|---|---|
| **State** | 🟡 Blast layer is **merged to `main`** (the earlier "unmerged on `feat/event-builder-rebuild`" note was stale — confirmed by recon 2026-07-09). Lifecycle event-comms layer built + committed locally on the `event-comms` worktree branch (off `main`), NOT pushed/merged/deployed — Adam's review gates everything. |
| **V1 item** | None — post-July-11 platform work |
| **Last updated** | 2026-07-11 |
| **Owner** | Adam |
| **Blocked on** | Adam: (1) review of the `event-comms` branch, (2) run `prisma/sql/event-comms-rsvp-columns.sql` in Neon Console BEFORE any deploy of the branch (the crons query the two new RSVP columns), (3) deploy. SMS channel (blast + any lifecycle fast-follow) still needs `MARKETING_TWILIO_PHONE_NUMBER` (+ `TWILIO_*`) in Vercel. |
| **Next** | Adam reviews the `event-comms` branch, runs the additive SQL, merges + deploys himself; then per workspace flip `reminder.pre_event.enabled` / `followup.enabled` (both default OFF) in Settings → Communications. Explicitly deferred: SMS lifecycle sends (fast-follow, consent-gated via the blast pattern), anything agentic, segments beyond one event's lifecycle, template-editor expansion, enforcing canSend/ChannelSubscription (separate Phase-2 backfill/cutover). |

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

# Lifecycle event-comms layer (2026-07-10, `event-comms` branch)
lib/comms/lifecycle-gate.ts                   ← SuppressionEntry hard-block gate, fail-closed; shadow evaluateConsent probe (verdict discarded)
lib/rsvp-submit.ts                            ← registration confirmation normalized onto sendTemplatedEmail (rsvp.confirmation, logged)
lib/commerce/confirmation.ts                  ← paid/comp ticket confirmation normalized the same way (2026-07-11 fast-follow); QR buyers get rsvp.confirmation_paid, others rsvp.confirmation
app/api/cron/event-reminders/route.ts         ← day-of now suppression-gated + new pre-event (N-days-before) section
app/api/cron/post-event-followup/route.ts     ← new cron: post-event thank-you to checked-in attendees (endAt, fallback startAt+6h)
lib/email-templates-defaults.ts               ← rsvp.confirmation rewritten (ticket link), rsvp.confirmation_paid (door QR) + event.reminder_upcoming + event.followup added; 3 new platform settings (new sends default OFF)
prisma/sql/event-comms-rsvp-columns.sql       ← additive SQL for RSVP.preEventReminderSentAt + postEventFollowupSentAt — NOT applied, Adam runs it
tests/unit/lifecycle-gate.test.ts             ← fail-closed guarantees pinned
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
