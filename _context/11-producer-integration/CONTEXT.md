# Stage 11 — Integrations (Producer + Outbound + House Phone)

> Outbound wires: Phase J webhook to Producer, Svix outbound webhook fan-out for future integrators, House Phone trigger interface (NoBC OS → Runtype master agent → Twilio).

## Status

| Field | Value |
|---|---|
| **State** | ✅ Shipped |
| **V1 item** | #20 (Svix portion), Phase J (cross-cutting), House Phone trigger (V1.5) |
| **Last updated** | 2026-05-20 |
| **Owner** | Adam |
| **Blocked on** | House Phone migration (V1.5) |
| **Next** | V1.5 — wire House Phone trigger after House Phone migrates to Adam's Runtype account |

## Scope

All outbound communication leaving NoBC OS:

1. **Phase J webhook to Producer** — `POST https://producer.thenobadcompany.com/api/webhooks/nobc-os/event-notify` on every event publish/update/cancel. HMAC-signed.
2. **Svix outbound webhook fan-out** — generic event webhooks for SaaS integrators. Members + RSVPs + events subscribed by integrators in each workspace.
3. **House Phone trigger interface** — when NoBC OS needs SMS (welcome message in V1.5, RSVP confirmations, event reminders), trigger Runtype master agent → Communications sub-agent → Twilio. NoBC OS never touches Twilio directly.

## Files in play

```
app/api/webhooks/producer/send/route.ts         ← internal helper to fire Phase J
app/api/webhooks/svix/subscribe/route.ts        ← integrator subscribes
app/api/webhooks/svix/[id]/route.ts             ← manage subscription
lib/webhooks/phase-j.ts                         ← Phase J HMAC + retry
lib/webhooks/svix-client.ts                     ← Svix SDK wrapper
lib/runtype/trigger.ts                          ← House Phone trigger
lib/webhooks/queue.ts                           ← retry queue for failed deliveries
```

## Inputs

- Event publish/update/cancel (from stage 03)
- Member application approval (from stage 02) — V1.5+ triggers welcome SMS
- RSVP confirmation (from stage 04) — V1.5+ triggers confirmation SMS
- Refund issued (from stage 05) — V1.5+ triggers refund SMS

## Outputs

- HMAC-signed POST to Producer
- Svix-delivered webhook to subscribed integrator URLs
- Runtype master agent invocation (which then calls Twilio)
- `WebhookDelivery` rows for retry tracking
- `AuditEvent` rows for every outbound trigger

## Schema models

- **WebhookDelivery**: workspaceId, targetType (`phase_j | svix | runtype`), payload (JSON), signature, status (`pending | delivered | failed | retrying`), attemptCount, lastAttemptAt, nextRetryAt
- **WebhookSubscription** (Svix-backed): workspaceId, integratorId, eventTypes (array), url, signingSecret

## Rules — DO NOT VIOLATE

1. **NO TWILIO. EVER.** NoBC OS never adds the Twilio SDK, never imports Twilio, never adds a Twilio env var. SMS goes through Runtype → House Phone. This rule is non-negotiable and applies to this stage hardest.
2. **Phase J payloads are HMAC-signed.** Use `PRODUCER_WEBHOOK_SECRET`. Producer rejects unsigned or invalidly-signed requests.
3. **Webhook delivery never blocks the originating action.** If Producer is down, an event still publishes. The webhook queues for retry.
4. **Exponential backoff with cap.** Retry at 1m, 5m, 30m, 2h, 12h, 24h. After 24h give up and surface in operator dashboard.
5. **Runtype unavailability degrades gracefully.** If Runtype is down, SMS-triggering features fall back to email or queue. Never crash the originating flow.
6. **Workspace-scoped subscriptions.** Integrators can only subscribe to their own workspace's events.

## Environment variables

- `PRODUCER_WEBHOOK_URL` — Producer's Phase J endpoint
- `PRODUCER_WEBHOOK_SECRET` — HMAC secret (shared with Producer)
- `SVIX_API_KEY` — Svix account API key
- `SVIX_APP_ID` — Svix app ID per workspace (or global)
- `RUNTYPE_API_URL` — Runtype API base
- `RUNTYPE_API_KEY` — workspace's Runtype token

## What this stage does NOT own

- The House Phone itself (Communications sub-agent inside Runtype) → managed by Nathan / Adam in Runtype, not in NoBC OS code
- Inbound webhooks (e.g., Stripe webhook, future integrator-to-NoBC-OS pushes) → owned by relevant feature stages (Stripe inbound = `05-payments/`)
- Twilio SDK or any direct SMS code → does not exist in NoBC OS, by absolute rule
- Producer's side of the Phase J handler → Producer codebase
