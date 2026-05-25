# Stage 14 — House Phone

> The shared multi-operator SMS inbox for live events — list conversations, toggle per-conversation AI auto-reply, and send outbound replies via Twilio.

## Status

| Field | Value |
|---|---|
| **State** | 🟡 In progress |
| **V1 item** | Post-V1 / V1.5 comms (not in items #1–20) |
| **Last updated** | 2026-05-24 |
| **Owner** | Adam |
| **Blocked on** | `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` + `HOUSE_PHONE_WORKSPACE_ID` not yet set in Vercel; the **Railway** inbound-SMS service (external) must be deployed and pointed at the Twilio number. (Analytics tab: nothing — code-complete.) |
| **Next** | The House Phone Intelligence tab is code-complete (`/operator/intelligence?category=house-phone`; see Files in play). For the inbox itself: set the four env vars in Vercel, deploy/point the Railway inbound webhook at the Twilio number, then verify the inbound → Postgres → polled-UI → reply round trip end to end. |

## Scope

The operator-facing side of House Phone, hosted in nobc-os:

- **Reading the inbox** — workspace-scoped conversation list, each with its recent thread and an unread flag.
- **Outbound replies** — operator types a reply; nobc-os sends it via the Twilio REST API and records the `OUTBOUND` message.
- **Per-conversation controls** — toggle AI auto-reply (`aiEnabled`, consumed by the Railway inbound service), associate a published event, correct the patron name.
- **The UI** — `/operator/house-phone`, a two-pane inbox open to any workspace member.
- **Analytics** — the *House Phone* tab in the operator Intelligence dashboard (`/operator/intelligence?category=house-phone`) reads these SMS rows for volume, AI-categorized topics, contact insights, and response stats. Backed by `/api/sms/analytics` and `/api/sms/categorize`; the tab UI lives in the Intelligence stage (`_context/12-intelligence/`).

Responsibility ends at the database boundary. **Inbound** SMS handling (Twilio webhook receipt, signature validation, AI auto-reply generation) lives in a **separate Railway service**, not here — it writes `SmsConversation`/`SmsMessage` rows to the same Postgres, which this stage then reads.

## Files in play

```
prisma/schema.prisma                              ← SmsConversation, SmsMessage, SmsDirection enum
prisma/migrations/20260522000000_house_phone_sms/ ← additive migration (2 tables + 1 enum)
lib/twilio.ts                                     ← Twilio client + sendSms() (null-safe until env set)
app/api/sms/conversations/route.ts               ← GET — workspace-scoped inbox feed (thread + unread)
app/api/sms/conversation/[id]/route.ts            ← PATCH — aiEnabled toggle (+ name, eventId)
app/api/sms/reply/route.ts                        ← POST — send via Twilio, then record OUTBOUND msg
app/operator/house-phone/page.tsx                 ← server: resolve workspace + published events
app/operator/house-phone/HousePhoneClient.tsx     ← client: two-pane inbox, 4s polling
app/operator/operator-nav.tsx                     ← House Phone nav link (MessageSquare icon)

# House Phone Intelligence tab (analytics)
prisma/migrations/20260524000000_add_sms_message_category/ ← additive migration (SmsMessage.category)
app/api/sms/analytics/route.ts                    ← GET — analytics payload (volume/topics/contacts/response)
app/api/sms/categorize/route.ts                   ← GET — AI topic categorization (Haiku) for inbound msgs
app/operator/intelligence/_components/HousePhonePanel.tsx   ← client: the House Phone Intelligence tab
app/operator/intelligence/_components/charts.tsx           ← + VBars (vertical bar chart) for by-day volume
app/operator/intelligence/_components/IntelligenceView.tsx ← House Phone tab registration
```

## Inputs

- Operator session (Clerk) → `getMemberWorkspaceId(userId)` scopes every read/write.
- `SmsConversation` / `SmsMessage` rows written by the Railway inbound service.
- Published events for the conversation→event selector.
- Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `HOUSE_PHONE_WORKSPACE_ID`.

## Outputs

- `OUTBOUND` `SmsMessage` rows + a delivered Twilio SMS (reply route).
- Mutations to `SmsConversation.aiEnabled` / `name` / `eventId` (PATCH route).
- JSON inbox feed consumed by the polling UI.

## Rules — DO NOT VIOLATE

1. **Twilio is allowed here only because of the explicit 2026-05-22 override in root `CLAUDE.md`.** nobc-os does **outbound** sends only; never add an inbound Twilio webhook or signature handling here — that is Railway's job.
2. **AI auto-reply runs on Railway, not here.** The one in-stage Anthropic call is the analytics topic-categorization job (`GET /api/sms/categorize`), which uses `claude-haiku-4-5-20251001` — an explicit Adam-authorized exception (2026-05-24) to the locked sonnet model, scoped to cheap high-volume SMS classification only. Any **other** AI added to this stage must use the locked `claude-sonnet-4-20250514`.
3. Every read and write is workspace-scoped (the conversation must belong to the caller's workspace before any mutation or send).
4. Record `OUTBOUND` messages only after Twilio accepts the send, so the thread never shows undelivered messages as sent.
5. Any operator in the workspace may use the inbox — no owner/role gate (it's a shared live-event tool).

## What this stage does NOT own

- **Inbound SMS, signature validation, AI auto-reply** → the external Railway service.
- **General SMS-via-Runtype for non-House-Phone features** → still banned in nobc-os (root `CLAUDE.md`, "No Twilio — except the House Phone inbox").
- **Events / publishing** → `_context/03-events/` (this stage only reads published events for the selector).
- **The Runtype "House Phone" Communications sub-agent** → a separate, identically-named thing in the Architecture diagram; unrelated to this web inbox.

## Schema fields

```prisma
enum SmsDirection { INBOUND OUTBOUND }

model SmsConversation {
  id, workspaceId (FK), phone, name?, eventId? (FK Event),
  aiEnabled @default(true), createdAt, updatedAt
  @@unique([workspaceId, phone])  // one conversation per phone per workspace
}

model SmsMessage {
  id, conversationId (FK), direction (SmsDirection),
  body @db.Text, aiGenerated @default(false),
  category?,  // AI topic label for inbound msgs (analytics); null until categorized
  createdAt
  @@index([conversationId, createdAt])
}
```

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/sms/conversations` | Workspace-scoped inbox feed (each conversation + recent thread + unread). |
| PATCH | `/api/sms/conversation/[id]` | Toggle `aiEnabled`; optionally set `name` / `eventId`. |
| POST | `/api/sms/reply` | Send a reply via Twilio REST, then record the `OUTBOUND` message. |
| GET | `/api/sms/analytics` | House Phone analytics: volume, topics, contacts, response stats (workspace-scoped). |
| GET | `/api/sms/categorize` | Categorize uncategorized inbound messages into topic labels (Haiku); called on tab load, debounced. |
| — (page) | `/operator/house-phone` | Two-pane shared inbox UI; polls the feed every 4s. |
| — (tab) | `/operator/intelligence?category=house-phone` | House Phone Intelligence tab (analytics dashboard). |

## Edge cases

- **Realtime is polling, not SSE** — the UI re-fetches the feed every 4s. Inbound messages appear on the next poll.
- **Twilio unset** — `sendSms()` throws; the reply route returns 502 and the UI surfaces the error. Reads still work.
- **No Clerk session (Railway / cron)** — workspace comes from `HOUSE_PHONE_WORKSPACE_ID`, since there's no number→workspace mapping in the schema (single-tenant V1).
