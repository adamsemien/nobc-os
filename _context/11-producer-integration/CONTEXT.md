# Stage 11 — Integrations (Producer + Outbound)

> Outbound wires: Phase J webhook to Producer, Svix outbound webhook fan-out for future integrators. **House Phone is no longer routed through this stage** — Runtype was scratched (see "House Phone — Runtype scratched" below).

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #20 (Svix portion), #26 (Phase J webhook to Producer) |
| **Last updated** | 2026-05-28 |
| **Owner** | Adam |
| **Blocked on** | Nothing |
| **Next** | V1.5 polish — Svix subscription manager UI; harden Phase J retry queue. House Phone SMS is owned end-to-end by Stage 14 + the external Railway service (`nobc-house-phone`); no integration work for it remains here. |

## Scope

All outbound (non-SMS) communication leaving NoBC OS:

1. **Phase J webhook to Producer** — `POST https://producer.thenobadcompany.com/api/webhooks/nobc-os/event-notify` on every event publish/update/cancel. HMAC-signed.
2. **Svix outbound webhook fan-out** — generic event webhooks for SaaS integrators. Members + RSVPs + events subscribed by integrators in each workspace.

SMS is **not** in scope here. The House Phone SMS inbox (outbound replies + Twilio outbound from nobc-os, Railway service for inbound) is owned end-to-end by Stage 14.

## Files in play

```
app/api/webhooks/producer/send/route.ts         ← internal helper to fire Phase J
app/api/webhooks/svix/subscribe/route.ts        ← integrator subscribes
app/api/webhooks/svix/[id]/route.ts             ← manage subscription
lib/webhooks/phase-j.ts                         ← Phase J HMAC + retry
lib/webhooks/svix-client.ts                     ← Svix SDK wrapper
lib/webhooks/queue.ts                           ← retry queue for failed deliveries
lib/producer-webhook.ts                         ← consolidated Phase J sender (current implementation)
```

## Inputs

- Event publish/update/cancel (from stage 03)
- Member application approval (from stage 02) — Svix `application.approved` fan-out
- RSVP confirmation (from stage 04) — Svix `rsvp.confirmed` fan-out
- Refund issued (from stage 05) — Svix `payment.refunded` fan-out

## Outputs

- HMAC-signed POST to Producer
- Svix-delivered webhook to subscribed integrator URLs
- `WebhookDelivery` rows for retry tracking
- `AuditEvent` rows for every outbound trigger

## Schema models

- **WebhookDelivery**: workspaceId, targetType (`phase_j | svix`), payload (JSON), signature, status (`pending | delivered | failed | retrying`), attemptCount, lastAttemptAt, nextRetryAt
- **WebhookSubscription** (Svix-backed): workspaceId, integratorId, eventTypes (array), url, signingSecret

## House Phone — Runtype scratched

Earlier drafts of this stage described a "House Phone trigger interface" that routed SMS through `NoBC OS → Runtype master agent → Communications sub-agent → Twilio`. **That architecture was evaluated and dropped.** Final design:

- **Inbound** SMS is owned by an external standalone Node.js service on Railway (`nobc-house-phone`, separate repo) — direct Twilio webhook receipt, signature validation, per-phone rate limiting, AI auto-reply.
- **Outbound** SMS replies are sent from nobc-os directly via the Twilio REST API (`lib/twilio.ts` → `/api/sms/reply`), guarded by the explicit Twilio override in root `CLAUDE.md`.

Both halves share the same Postgres. No Runtype involvement. Stage 14 owns the full picture. Any reference here, in `CLAUDE.md`, or in another stage to a Runtype-based House Phone is stale and should be corrected.

## Rules — DO NOT VIOLATE

1. **No Twilio in this stage.** The only sanctioned Twilio surface is the House Phone outbound reply in Stage 14 (`lib/twilio.ts` + `/api/sms/reply`). Do not import Twilio or add a Twilio env var here.
2. **Phase J payloads are HMAC-signed.** Use `PRODUCER_WEBHOOK_SECRET`. Producer rejects unsigned or invalidly-signed requests.
3. **Webhook delivery never blocks the originating action.** If Producer is down, an event still publishes. The webhook queues for retry.
4. **Exponential backoff with cap.** Retry at 1m, 5m, 30m, 2h, 12h, 24h. After 24h give up and surface in operator dashboard.
5. **Workspace-scoped subscriptions.** Integrators can only subscribe to their own workspace's events.

## Environment variables

- `PRODUCER_WEBHOOK_URL` — Producer's Phase J endpoint
- `PRODUCER_WEBHOOK_SECRET` — HMAC secret (shared with Producer)
- `SVIX_API_KEY` — Svix account API key
- `SVIX_APP_ID` — Svix app ID per workspace (or global)

## What this stage does NOT own

- **House Phone SMS (inbox, outbound replies, analytics)** → `_context/14-house-phone/` + the external Railway service (`nobc-house-phone`)
- Inbound webhooks (e.g., Stripe webhook, future integrator-to-NoBC-OS pushes) → owned by relevant feature stages (Stripe inbound = `05-payments/`)
- Twilio SDK in any non-House-Phone feature → does not exist in NoBC OS, by absolute rule
- Producer's side of the Phase J handler → Producer codebase
