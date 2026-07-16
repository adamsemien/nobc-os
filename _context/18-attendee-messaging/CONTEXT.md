# Stage 18 — Attendee Messaging (Blast + lifecycle event-comms)

> One-off operator blasts (email or SMS) to ONE event's confirmed attendees — consent-gated, suppressed, logged, dry-run-first. Post-purchase attendee messaging, deliberately NOT a marketing automation platform. Since 2026-07-10 this stage also holds the deterministic **lifecycle event-comms layer** (email-only): registration confirmation, pre-event reminder, day-of reminder, post-event follow-up.

## Status

| Field | Value |
|---|---|
| **State** | 🟡 Blast layer is **merged to `main`** (the earlier "unmerged on `feat/event-builder-rebuild`" note was stale — confirmed by recon 2026-07-09). Lifecycle event-comms layer built + committed locally on the `event-comms` worktree branch (off `main`), NOT pushed/merged/deployed — Adam's review gates everything. **2026-07-15: SMS opt-in page (TCPA express-written-consent capture) built on the `recon-import-suppression-lifecycle` worktree branch — uncommitted, migrations NOT run (see Blocked on).** |
| **V1 item** | None — post-July-11 platform work |
| **Last updated** | 2026-07-15 |
| **Owner** | Adam |
| **Blocked on** | Adam: (1) review of the `event-comms` branch, (2) run `prisma/sql/event-comms-rsvp-columns.sql` in Neon Console BEFORE any deploy of the branch (the crons query the two new RSVP columns), (3) deploy. SMS channel (blast + any lifecycle fast-follow) still needs `MARKETING_TWILIO_PHONE_NUMBER` (+ `TWILIO_*`) in Vercel. **SMS opt-in page additionally blocked on: Adam runs `prisma/sql/sms-optin-01-enum.sql` then, separately committed, `prisma/sql/sms-optin-02-artifact.sql` (enum value MUST commit first — see file headers); sets `OPTIN_TOKEN_SECRET` in Vercel (Path A tokens fail closed without it — cold path still works); Chloe replaces the marked copy placeholders; counsel resolves the Terms hotline-number inconsistency (737-727-4222 vs the marketing toll-free sender) flagged in lib/opt-in/disclosure.ts.** |
| **Next** | Adam reviews + applies the two `sms-optin-*.sql` files (01 first, own commit), sets `OPTIN_TOKEN_SECRET`, reviews the opt-in branch. Then: the re-permission email that mints Path-A tokens (`mintOptInToken`), and stage-2 SMS confirmation (flips `ConsentArtifact.confirmedAt` on INBOUND REPLY only — blocked on toll-free verification). Standing dependencies named in code: reconcile Blast recipient resolution onto SuppressionEntry/canSend; one-shot re-convergence for consent rows written before their Member got a personId. Prior deferred items unchanged. |

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

# SMS opt-in page (2026-07-15, uncommitted on recon-import-suppression-lifecycle worktree):
app/opt-in/sms/page.tsx                       ← public consent page (Path A ?t= token greeting, Path B cold)
app/opt-in/sms/OptInForm.tsx                  ← client form; unchecked-by-default checkbox; CHLOE placeholders marked
app/api/opt-in/sms/route.ts                   ← POST: rate-limited, honeypot, token→cold degrade, server-rebuilt disclosure
lib/opt-in/token.ts                           ← HMAC token (OPTIN_TOKEN_SECRET, 365d TTL, fail-closed mint, silent-degrade verify)
lib/opt-in/phone.ts                           ← THE normalizer for this page (libphonenumber-js → E.164)
lib/opt-in/disclosure.ts                      ← DISCLOSURE_VERSION v1 + verbatim block builder (counsel's copy, number flag inside)
lib/opt-in/record.ts                          ← ConsentArtifact write + writeConsent(EXPRESS_WRITTEN, explicit) + binding classification
lib/opt-in/zip-timezone.ts                    ← zip→IANA lookup (El Paso=Mountain; zip-level on purpose)
lib/data/zip-timezones.json                   ← vendored 42,555-zip map, stamped (zipcodes@8.0.0 + geo-tz@8.1.8, 2026-07-15)
scripts/vendor-zip-timezones.mjs              ← regenerates the JSON (dev-only deps)
prisma/sql/sms-optin-01-enum.sql              ← ALTER TYPE ADD VALUE 'EXPRESS_WRITTEN' — own commit, run FIRST, NOT applied
prisma/sql/sms-optin-02-artifact.sql          ← ConsentBindingMethod enum + ConsentArtifact table + Person.postalCode — NOT applied
tests/unit/comms/opt-in.test.ts               ← token, E.164, binding classification, disclosure elements, zip map (16 tests)
app/api/operator/people/[id]/route.ts         ← DELETE gains the ConsentArtifact 409 guard (Restrict would raw-P2003 otherwise)
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
