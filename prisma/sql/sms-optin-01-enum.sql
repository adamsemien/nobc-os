-- SMS opt-in page (TCPA consent capture) — migration 1 of 2.
--
-- MUST run as its OWN statement, committed BEFORE sms-optin-02-artifact.sql:
-- Postgres forbids using a value added by ALTER TYPE ... ADD VALUE inside the
-- same transaction that added it. Apply via:
--   prisma db execute --file prisma/sql/sms-optin-01-enum.sql
-- then, separately:
--   prisma db execute --file prisma/sql/sms-optin-02-artifact.sql
-- NEVER prisma db push (see CLAUDE.md landmine list).
--
-- Generated 2026-07-15 via `prisma migrate diff` (offline, datamodel-to-datamodel).
-- Purely additive: adds one enum value. Nothing dropped, altered, or renamed.

ALTER TYPE "ConsentBasis" ADD VALUE 'EXPRESS_WRITTEN';
