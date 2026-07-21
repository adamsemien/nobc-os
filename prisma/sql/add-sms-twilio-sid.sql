-- Additive migration: SmsMessage.twilioSid — Twilio MessageSid idempotency.
--
-- Backs the nobc-house-phone inbound idempotency fix (its PR #1): a retried Twilio
-- webhook carrying the same MessageSid hits the unique index and is a no-op, so there
-- is no double AI-reply (no double Anthropic charge) and no double-text to the guest.
--
-- APPLY in a coordinated DB window, file-only:
--   node node_modules/prisma/build/index.js db execute \
--     --file prisma/sql/add-sms-twilio-sid.sql --schema prisma/schema.prisma
-- NEVER `prisma db push` (it would drop Asset_searchVector_idx). Additive only —
-- no drops, no type changes — and idempotent, so re-running is safe.
--
-- ORDER: apply this SQL FIRST, then merge + deploy nobc-house-phone PR #1.

ALTER TABLE "SmsMessage" ADD COLUMN IF NOT EXISTS "twilioSid" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "SmsMessage_twilioSid_key" ON "SmsMessage" ("twilioSid");
