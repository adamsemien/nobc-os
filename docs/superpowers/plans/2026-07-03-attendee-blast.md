# Attendee Messaging Layer (Blast) — Build Contract (Stage 18)

> Adam's four-phase directive 2026-07-02, Phase 4. On
> `feat/event-builder-rebuild`. Grounded in the attendee-messaging recon:
> the CHANNEL-axis models were fiction on main; consent lives on this
> branch's Member.marketing* columns with Application as the documented
> fallback.

**Goal:** an operator sends one email or SMS blast to one event's confirmed
attendees — consent-gated, suppressed, logged, dry-run-first.

## Decisions

**B1 — Schema (4A), additive only.** `Blast` (workspace/event-scoped,
channel, DRAFT→SENDING→SENT/FAILED, subject/body, counts, `clientToken`
with `@@unique([workspaceId, clientToken])` for double-submit idempotency),
`BlastRecipient` (per-recipient outcome log; `rsvpId`/`memberId` are plain
references, NOT FKs — delivery records must survive RSVP cleanup),
`SuppressedContact` (per-workspace destination blocklist,
`@@unique([workspaceId, channel, destination])` — deliberately a blocklist,
not a ChannelSubscription axis). Refinement to the directive's expected
enum: `SKIPPED_NO_DESTINATION` added — the directive's own confirm copy
("7 no phone") distinguishes unreachable from unconsented, so the status
does too. SQL: `prisma/sql/attendee-blast.sql` (3 enums, 3 tables, 6
indexes, 4 FKs; zero DROP/RENAME), applied to ep-sweet-term via
`db execute`.

**B2 — Consent (4A-6).** Profile first (`marketingEmailOptIn` /
`marketingSmsOptIn`), the member's LATEST Application as fallback
(`emailOptIn` for email, `smsOptInAt IS NOT NULL` for SMS). Guests with no
record → SKIPPED_NO_CONSENT, visible in the dry run. `redListed` never
selected, never read — asserted by test.

**B3 — One resolution, shared.** The dry run and the send run the SAME
`resolveBlastRecipients`; the send additionally requires
`expectedRecipients` to equal the live queued count (the dry run is
mandatory by construction, not by convention). Destinations are not
deduped: per-attendee messaging means two attendees sharing an inbox each
get their own message (documented).

**B4 — Email engine (4B).** Chassis = lib/email.ts (`sendBlastEmail`, the
locked FROM; the Blast rows are the audit, so no per-send auditEvent).
Chunked concurrency of 8 with per-recipient isolation; bounded retry on
429/5xx (2 retries, 300ms/1200ms backoff); outcome + provider id persisted
per recipient. The blast body is operator-composed plain text — the
templated-email system (EmailTemplate rows) is deliberately not involved.

**B5 — SMS engine (4C).** Sends from `MARKETING_TWILIO_PHONE_NUMBER` only
(`sendMarketingSms` in lib/twilio.ts, fail-soft like the House Phone
client); unset → the surface renders disabled with honest copy. Sequential
at 1 msg/sec (injectable sleeper for tests); "Reply STOP to opt out."
auto-appended unless the body already carries a STOP notice; every send
logged to the House Phone inbox (SmsConversation upsert + OUTBOUND
SmsMessage, category `marketing`; the live-DB `twilioSid` column is NOT
added to the schema — landmine comment at the write site). Twilio 21610
(carrier STOP) auto-populates SuppressedContact. In-request pacing bounds
the run: >200 recipients refused with honest copy — no silent caps.

**B6 — Surface + rails (4D).** Messages tab on the event dashboard;
compose → "Check the guest list" (dry run: per-person verdicts + reasons +
the consent-basis sentence) → confirm sentence with exact counts → send.
ADMIN floor on every route (the tab renders the 403 honestly). Durable rate
limit: 4 blasts per event per hour, counted from Blast rows. AI
never composes-and-sends: no agent surface reaches the routes; `confirm:
true` is the human's literal flag (the publish pattern). Editing the
message after a check clears it client-side; the count guard enforces the
same server-side.

**B7 — Twilio rule amendment.** Root CLAUDE.md's House-Phone-only Twilio
rule now records this directive's explicit approval for the marketing
number axis. `MARKETING_TWILIO_PHONE_NUMBER` documented in the env list
(name only).

## Acceptance (4E, real rows on ep-sweet-term; Resend + Twilio mocked)

1. Dry run returns the exact verdict list: profile consent, application
   fallback, guest no-consent (visible), no-phone, suppressed.
2. Email blast sends to consented only; injected 429 retries and lands;
   locked FROM; per-recipient rows persisted; counts honest.
3. Red-listed but consented attendee RECEIVES (ACCESS never touches
   CHANNEL).
4. Double-submit raced: same clientToken concurrently → one Blast row, the
   queued set sends exactly once.
5. SMS blast: 1 msg/sec pacing observed, STOP copy appended, SmsMessage
   OUTBOUND rows with category `marketing` + conversations created,
   suppressed number skipped.
6. Marketing number unset → dry run reports the disabled surface; send 503s.
7. Guest-list drift (expectedRecipients mismatch) → 409.
8. tsc 0, eslint clean on touched files, NBS baseline + parity green, full
   suite: only the known pre-existing failures.
