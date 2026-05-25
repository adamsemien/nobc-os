-- House Phone Intelligence — AI topic categorization for inbound SMS.
-- Adds a nullable topic label to SmsMessage. Additive + backward-compatible:
-- existing Producer/NoBC reads and writes are unaffected (column defaults NULL).

-- AlterTable
ALTER TABLE "SmsMessage" ADD COLUMN "category" TEXT;
