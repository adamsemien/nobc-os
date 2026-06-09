-- Idempotency key for inbound House Phone SMS.
--
-- A retried Twilio inbound webhook re-POSTs the same MessageSid. Persisting it
-- under a UNIQUE constraint lets nobc-house-phone (routes/inbound.js) treat a
-- retry as a no-op instead of re-charging the AI and double-texting the guest.
--
-- Additive + nullable: OUTBOUND rows and all pre-existing rows stay NULL, and
-- Postgres treats NULLs as distinct under a UNIQUE index, so the constraint
-- only binds INBOUND rows that carry a SID. IF NOT EXISTS keeps it safe to
-- re-run by hand (this repo applies additive SQL via `prisma db execute`,
-- never `prisma db push`).

ALTER TABLE "SmsMessage" ADD COLUMN IF NOT EXISTS "twilioSid" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SmsMessage_twilioSid_key" ON "SmsMessage" ("twilioSid");
