-- Day-of reminder dedupe + plus-one capture fields on RSVP.

ALTER TABLE "RSVP" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
ALTER TABLE "RSVP" ADD COLUMN "plusOneName" TEXT;
ALTER TABLE "RSVP" ADD COLUMN "plusOneInstagram" TEXT;
