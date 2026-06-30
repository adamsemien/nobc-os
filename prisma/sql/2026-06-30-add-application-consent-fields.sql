-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "agreedToMembershipTerms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "consentIp" TEXT,
ADD COLUMN     "consentUserAgent" TEXT,
ADD COLUMN     "emailOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailOptInAt" TIMESTAMP(3),
ADD COLUMN     "smsOptInAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
