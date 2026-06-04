-- Sponsor Intelligence — Phase 1 additive migration (brand-lift surveys)
-- Source: prisma migrate diff, hand-reviewed. The only statement removed was the false-drift
--   DROP INDEX "Asset_searchVector_idx";
-- (the DAM GIN index lives only in prod; never drop it — see prisma/sql/sponsor-intel-p0.sql).
-- Additive-only and idempotent. Producer shares this Postgres instance.

-- New enum (CREATE TYPE, never ALTER an existing enum)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SurveyPhase') THEN
    CREATE TYPE "SurveyPhase" AS ENUM ('PRE', 'POST', 'ACTIVATION');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SurveyResponse" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sponsorBrandId" TEXT,
    "memberId" TEXT,
    "phase" "SurveyPhase" NOT NULL,
    "token" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "sentAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SurveyResponse_token_key" ON "SurveyResponse"("token");
CREATE INDEX IF NOT EXISTS "SurveyResponse_workspaceId_idx" ON "SurveyResponse"("workspaceId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_eventId_idx" ON "SurveyResponse"("eventId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_sponsorBrandId_idx" ON "SurveyResponse"("sponsorBrandId");
CREATE INDEX IF NOT EXISTS "SurveyResponse_memberId_idx" ON "SurveyResponse"("memberId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SurveyResponse_workspaceId_fkey') THEN
    ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SurveyResponse_sponsorBrandId_fkey') THEN
    ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_sponsorBrandId_fkey"
      FOREIGN KEY ("sponsorBrandId") REFERENCES "SponsorBrandProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SurveyResponse_memberId_fkey') THEN
    ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
