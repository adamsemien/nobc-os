# Observability Plan — NoBC OS

_Last updated: 2026-06-11_

---

## 1. What the Resend email alerting layer covers (shipped)

`lib/alerting.ts` is a dependency-free alert dispatcher that sends via the existing
`lib/resend.ts` singleton (`resend.emails.send`). No new packages — Resend is already
in the project for transactional email.

It is wired into the following failure points:

| Route | Event name | Severity | Trigger |
|---|---|---|---|
| `POST /api/stripe/create-payment-intent` | `stripe.payment_intent.create_failed` | critical | Stripe API throws on PI creation |
| `POST /api/stripe/capture` | `stripe.payment_intent.capture_failed` | critical | Stripe API throws on capture |
| `POST /api/stripe/refund` | `stripe.refund.failed` | critical | Stripe cancel or refund API throws |
| `POST /api/stripe/checkout` | `stripe.checkout.session_create_failed` | critical | Stripe checkout session creation throws |
| `POST /api/m/events/[slug]/access/payment-intent` | `stripe.payment_intent.create_failed` | critical | Stripe API throws on PI creation (member/guest path) |
| `POST /api/m/events/[slug]/access/payment-intent` | `payment_intent.rsvp_transaction_failed` | error | DB serializable transaction fails (non-capacity race) |
| `POST /api/m/events/[slug]/access/submit` | `access.submit.transaction_failed` | error | DB serializable transaction throws unexpectedly |
| `POST /api/webhooks/producer` | `producer_webhook.processing_failed` | error | DB write or emitEvent throws in producer sync handler |
| `POST /api/sms/reply` | `sms.reply.twilio_send_failed` | error | Twilio `sendSms` throws |
| `app/error.tsx` (boundary) | `client.error_boundary.caught` | critical | Route-level React error boundary fires |
| `app/global-error.tsx` (boundary) | `client.error_boundary.caught` | critical | Root-level React error boundary fires |

**What each alert includes:** severity, event name, workspaceId (where available), Stripe object IDs,
amounts, status enums, error class, error message, ISO timestamp. **Never:** email addresses, member
names, phone numbers, card data, tokens, full request bodies.

**Redaction guard:** any `context` key matching `/email|phone|name|token|card|secret|password|ssn|dob|address/i`
is replaced with `[redacted]` before the payload leaves the process.

**No-op contract:** if `RESEND_API_KEY` is unset, the dispatcher logs to `console.error` only
and returns — no exception, no change to the caller's response. Mirrors the Svix `getSvix()` pattern.

**Non-blocking contract:** every `alert()` call in a route handler is `void alert(...)` — the
promise is not awaited in the response path. The dispatcher swallows all errors internally.

**Relay route hardening (`/api/alerting/client-error`):** per-IP fixed-window rate limit
(5 req / 60 s, in-process Map, best-effort / per-instance). Excess requests return
`200 {ok:true}` silently — no alert fires, no 429, no 500. Message body is truncated
to 500 chars before reaching the dispatcher.

---

## 2. Env vars

| Var | Required | Default | Purpose |
|---|---|---|---|
| `RESEND_API_KEY` | Yes (gates all email including alerts) | — | Existing Resend key; alerting no-ops if unset |
| `ALERT_EMAIL_TO` | No | `team@thenobadcompany.com` | Destination address for alert emails |

`from` is always `NoBC Alerts <team@thenobadcompany.com>` (locked address per CLAUDE.md).

Alert subjects take the form `[CRITICAL] stripe.payment_intent.create_failed`.

---

## 3. Sentry — proposed next step (NEW DEPENDENCY, requires Adam's sign-off)

### What Sentry adds beyond Resend email alerts

| Capability | Resend alerting (now) | Sentry (proposed) |
|---|---|---|
| Real-time notification | Yes | Yes |
| Full stack traces | No (message + class only) | Yes |
| Source map resolution | No | Yes (maps minified frames to source) |
| Release tracking | No | Yes (`SENTRY_RELEASE` per deploy) |
| Error grouping / dedup | No (every throw = one email) | Yes (fingerprinted issues) |
| Regression detection | No | Yes (issue resurfaces after mark-resolved) |
| Performance tracing | No | Yes (transaction spans, Web Vitals) |
| Session replay | No | Yes (optional, PII risk — review before enabling) |
| Breadcrumbs | No | Yes (recent console + network calls before crash) |
| Issue assignment & workflow | No | Yes |

### Rough setup

```bash
npm install --save @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

This adds `instrumentation.ts`, `sentry.client.config.ts`, `sentry.server.config.ts`, and wraps
`next.config.ts` with the Sentry webpack plugin (source map upload).

### New env vars required

| Var | Purpose |
|---|---|
| `SENTRY_DSN` | Project DSN (client + server) |
| `SENTRY_ORG` | Org slug (for release + source map upload) |
| `SENTRY_PROJECT` | Project slug |
| `SENTRY_AUTH_TOKEN` | CI/deploy token for source map upload |
| `NEXT_PUBLIC_SENTRY_DSN` | Exposed to the browser bundle |

### Things to decide before enabling

1. **Session replay** — captures DOM snapshots. Must be configured with `maskAllText: true` and
   `maskAllInputs: true` to avoid PII capture. Review Sentry's data-residency settings first.
2. **Performance sampling rate** — `tracesSampleRate: 0.1` (10%) recommended for production; 1.0 only
   in dev/staging.
3. **PII scrubbing** — add `beforeSend` to strip any event containing email, phone, or card patterns
   from the event payload before it leaves the browser/server.
4. **Source maps** — requires the Sentry webpack plugin running at build time and `SENTRY_AUTH_TOKEN`
   in Vercel build env. Maps are uploaded and stripped from the public bundle.
5. **Cost** — Sentry free tier covers ~5K errors/month. At any real event volume, budget for the
   Team plan (~$26/month per 50K events).

---

## 4. SLO/alerting hygiene — what's page-worthy vs. noise

### Page immediately (critical)

- Any Stripe API error on the money path: PI creation, capture, refund, checkout session. These
  directly prevent users from paying or operators from collecting money. Every occurrence is
  significant regardless of volume.
- Client error boundaries firing. These mean users are seeing a crash screen.

### Ticket / async triage (error)

- DB transaction failures on RSVP write. Likely transient (Neon cold start, serialization conflict
  under load). One occurrence is noise; sustained rate is signal.
- Producer webhook DB failures. Event sync breaks; operator calendar drifts.
- Twilio SMS send failures. Operators can't reply from inbox; not money-path but live-event-critical.

### Do NOT alert on

- Normal 4xx validation (400, 401, 403, 404, 409 capacity/duplicate) — these are expected,
  user-correctable, and high-volume at events.
- Stripe PaymentIntent status checks that return non-actionable statuses (`canceled`, `succeeded`)
  — these are already handled in-flow.
- `emitEvent` / Svix failures — these are already fire-and-forget with their own console.error.
  Add alerting to them only if audit event loss becomes a compliance concern.

### Future SLO definition (once Sentry or metrics are in place)

Define a payment-path SLI: "% of PaymentIntent create + capture calls that complete without a 5xx".
Target: 99.9% over 7 days (≈ 10 minutes of budget per week). Alert at 14.4x burn rate (exhausts
monthly budget in 2 hours). This requires a metrics layer (Sentry performance or Vercel Analytics
`unstable_after`) — not possible with email-only alerting today.
