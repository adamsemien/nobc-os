-- Data Integrity Build A — additive-only. Adds the completion signal to
-- Application. submittedAt is written ONLY inside the apply-submit
-- transaction (app/api/apply/membership/[id]/submit/route.ts); null means
-- the applicant created a draft and never clicked Submit.
--
-- Verified via `prisma migrate diff --from-config-datasource --to-schema
-- prisma/schema.prisma --script` against the scratch DB (ep-sweet-term) and
-- hand-extracted to this single statement — the full diff output also
-- included a large, unrelated migration gap (the entire Person/CRM
-- substrate never applied to scratch) and would have DROP'd the two
-- production-only indexes documented in CLAUDE.md
-- (Asset_searchVector_idx, Asset_embedding_hnsw_idx). None of that belongs
-- to this change; only the line below does.

ALTER TABLE "Application" ADD COLUMN "submittedAt" TIMESTAMP(3);
