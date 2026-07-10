-- Event-comms lifecycle dedupe columns (additive only).
-- Run by hand against the Neon DB (never prisma db push):
--   node node_modules/prisma/build/index.js db execute --file prisma/sql/event-comms-rsvp-columns.sql
--
-- preEventReminderSentAt  — stamped when the N-days-before reminder sends
--                           (/api/cron/event-reminders, pre-event section)
-- postEventFollowupSentAt — stamped when the post-event thank-you sends
--                           (/api/cron/post-event-followup)

ALTER TABLE "RSVP" ADD COLUMN IF NOT EXISTS "preEventReminderSentAt" TIMESTAMP(3);
ALTER TABLE "RSVP" ADD COLUMN IF NOT EXISTS "postEventFollowupSentAt" TIMESTAMP(3);
