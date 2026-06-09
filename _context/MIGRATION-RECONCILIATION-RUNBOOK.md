# Migration-History Reconciliation Runbook

**Owner:** Adam · **Created:** 2026-06-09 · **Branch:** `chore/reconcile-migration-history`
**Resolves:** overnight-audit data CRITICAL #3 (tracked migrations diverge from live schema) + #4
(`MemberEngagementEventType` 8 tracked vs 18 in code) + WARNING (DIRECT_URL gap).

> **What this window does:** records out-of-band schema (already live in Neon) as **tracked
> migrations**, so `prisma migrate` history finally matches reality. It does this with
> `prisma migrate resolve --applied`, which writes **only `_prisma_migrations` rows — it runs
> ZERO DDL and touches ZERO data.** No `db push`, no `migrate deploy`, no `--accept-data-loss`.

> **Why a coordinated window:** Producer (Replit) shares this exact Neon instance. `resolve`
> doesn't change schema, but doing it while Producer is mid-`migrate` could interleave
> `_prisma_migrations` writes. Agree a short window where Producer runs no migrations.

---

## 0. What was added in this PR (the artifacts you're applying)

10 catch-up migrations under `prisma/migrations/` whose SQL bodies are the **exact idempotent
DDL already live in prod** (so a fresh `migrate deploy` reproduces prod; `resolve` records it
with zero DDL). Listed in apply order:

| # | Migration name | Mirrors / source | What it records |
|---|---|---|---|
| 1 | `20260526170000_media_dam_schema` | **db-push only — no sql file** (generated from schema.prisma, hand-reviewed) | DAM enums + `Asset`/`MediaFolder`/`ShareLink`/`AssetDownload` tables, indexes, FKs, `Workspace.storageBytes` |
| 2 | `20260526180000_dam_search_vector` | `prisma/sql/dam-search-vector.sql` | search-vector trigger/function + **`Asset_searchVector_idx` GIN index** |
| 3 | `20260530170000_event_series_defaults` | `prisma/sql/series-defaults.sql` | `EventSeries.defaultCapacity` / `defaultEventAccess` |
| 4 | `20260601180000_sponsor_intel_p0_recap_snapshot` | `prisma/sql/sponsor-intel-p0.sql` | `SponsorBrandProfile` brief fields + `RecapSnapshot` |
| 5 | `20260601181000_sponsor_intel_p1_survey_response` | `prisma/sql/sponsor-intel-p1.sql` | `SurveyPhase` enum + `SurveyResponse` |
| 6 | `20260601182000_sponsor_intel_p2_custom_question_sponsor` | `prisma/sql/sponsor-intel-p2.sql` | `EventCustomQuestion.sponsorBrandId` + FK |
| 7 | `20260609010000_member_engagement_enum_values` | `prisma/sql/additive_engagement_enum.sql` | **enum CRITICAL #4** — 10 `ADD VALUE`s (8 → 18) |
| 8 | `20260609011000_member_merge` | `prisma/sql/additive_member_merge.sql` | `Member.mergedIntoId`/`mergedAt`, merge/RSVP/phone indexes |
| 9 | `20260609012000_member_pr2_dimensions` | `prisma/sql/additive_pr2_dimensions.sql` | `MemberEnrichmentStatus`, Member dimension cols, `MemberPsychographics`, `FieldDefinition` |
| 10 | `20260609013000_sponsor_audience_member_view` | `prisma/sql/sponsor-audience-view.sql` | `sponsor_audience_member` firewall view |

Also: `prisma.config.ts` gains `directUrl` (Prisma 7 forbids it in `schema.prisma`) +
`shadowDatabaseUrl`; `.env.local.example` documents `DIRECT_URL`.

> **`20260609012000` deliberate omission:** the source sql ended with
> `DROP TABLE IF EXISTS "playing_with_neon"` (a stray Neon sample table). A DROP is not authored
> into a tracked migration; the table is already gone in prod and absent from schema.prisma, so
> omitting it changes nothing.

---

## 1. Producer pre-coordination checklist

- [ ] Message Producer owner: reconciliation window agreed for `____` (date/time, ~15 min).
- [ ] Confirm Producer has **no in-flight `prisma migrate` / deploy** running and will start none
      during the window.
- [ ] Confirm Producer is **not** mid-`db push` against this Neon instance.
- [ ] (Recommended) Take/confirm a fresh Neon backup or branch snapshot exists. `resolve` is
      metadata-only, but snapshot-before-touching-`_prisma_migrations` is cheap insurance.
- [ ] Have `DIRECT_URL` (Neon **unpooled** host — no `-pooler` in the hostname) ready in
      `.env.local`. DDL/migrate must not go through PgBouncer.

---

## 2. Environment setup (local shell, one time)

```bash
# In .env.local (loaded by prisma.config.ts):
#   DATABASE_URL=<pooled Neon string>      # already set
#   DIRECT_URL=<UNPOOLED Neon string>      # NEW — set this before the window
# `npx prisma` is broken in this repo; always use the build entrypoint:
alias prisma-cli='node node_modules/prisma/build/index.js'
prisma-cli --version    # expect 7.8.0
```

---

## 3. Pre-flight — determine which migrations actually need resolving

`resolve --applied` **errors if a migration is already recorded**, and this project has built
schema via `db push`, so do **not** assume the original 20 migrations are present in
`_prisma_migrations`. Inspect first (read-only):

```bash
# Against DIRECT_URL (read-only SELECT — safe):
psql "$DIRECT_URL" -c \
  "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name;"
```

Compare that list to `ls prisma/migrations/ | grep '^2026'` (30 dirs after this PR).

**Decision rule — resolve every migration that is in `prisma/migrations/` but NOT in
`_prisma_migrations`, in chronological order.**

- **Common case** (all 20 originals already recorded): resolve only the **10 catch-ups** in §4.
- **If originals/baseline are also missing** (db-push-built prod): the schema is already live, so
  resolve the **missing originals too** — `resolve --applied` is still zero-DDL. Resolve in
  ascending timestamp order: baseline first, then each missing migration, ending with the 10
  catch-ups. (Skip any name already present.)

> If `_prisma_migrations` does not exist at all, prod was built purely by `db push`. Stop and
> ping the author — that's a baseline-adopt scenario (`migrate resolve --applied 20260515000000_baseline`
> first), still zero-DDL, but worth confirming before proceeding.

---

## 4. Apply — resolve the catch-up migrations (zero DDL, metadata only)

Run in this exact order. Each command writes **one `_prisma_migrations` row** and runs no SQL
against your tables:

```bash
prisma-cli migrate resolve --applied 20260526170000_media_dam_schema
prisma-cli migrate resolve --applied 20260526180000_dam_search_vector
prisma-cli migrate resolve --applied 20260530170000_event_series_defaults
prisma-cli migrate resolve --applied 20260601180000_sponsor_intel_p0_recap_snapshot
prisma-cli migrate resolve --applied 20260601181000_sponsor_intel_p1_survey_response
prisma-cli migrate resolve --applied 20260601182000_sponsor_intel_p2_custom_question_sponsor
prisma-cli migrate resolve --applied 20260609010000_member_engagement_enum_values
prisma-cli migrate resolve --applied 20260609011000_member_merge
prisma-cli migrate resolve --applied 20260609012000_member_pr2_dimensions
prisma-cli migrate resolve --applied 20260609013000_sponsor_audience_member_view
```

Expected per command: `Migration <name> marked as applied.` (no DDL output).

---

## 5. Post-checks

### 5a. Prod — migrations are recorded (read-only)

```bash
psql "$DIRECT_URL" -c "SELECT count(*) FROM _prisma_migrations;"
# Expect = 30 (20 originals + 10 catch-ups) in the common case.

psql "$DIRECT_URL" -c \
  "SELECT count(*) FROM pg_enum WHERE enumtypid = 'MemberEngagementEventType'::regtype;"
# Expect = 18  ← closes data CRITICAL #4
```

### 5b. Offline — history now matches schema (no prod connection)

This is the same diff captured in the PR; it reads the migrations dir + `schema.prisma` + a
**throwaway** shadow DB — **never prod**. Needs a local postgres as shadow:

```bash
docker run -d --name nobc-shadow -e POSTGRES_PASSWORD=shadow -e POSTGRES_USER=shadow \
  -e POSTGRES_DB=shadow -p 55432:5432 postgres:16
export SHADOW_DATABASE_URL="postgresql://shadow:shadow@localhost:55432/shadow"

prisma-cli migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script

docker rm -f nobc-shadow
```

**Expected output — exactly this, nothing more:**

```sql
-- DropIndex
DROP INDEX "Asset_searchVector_idx";
```

That single line is **expected false drift**: Prisma cannot represent a GIN index on the
`Unsupported("tsvector")` column (CLAUDE.md "Schema changes: never db push"). **Never act on it —
never drop that index.** Any *other* line means reconciliation is incomplete — stop and re-check.

> Note: Prisma 7 renamed the flag `--to-schema-datamodel` → `--to-schema` (used above).

---

## 6. Rollback

`resolve` is fully reversible and touched no data:

```bash
# Remove the rows you added (adjust the IN-list to exactly what you resolved this window):
psql "$DIRECT_URL" -c "DELETE FROM _prisma_migrations WHERE migration_name IN (
  '20260526170000_media_dam_schema','20260526180000_dam_search_vector',
  '20260530170000_event_series_defaults','20260601180000_sponsor_intel_p0_recap_snapshot',
  '20260601181000_sponsor_intel_p1_survey_response','20260601182000_sponsor_intel_p2_custom_question_sponsor',
  '20260609010000_member_engagement_enum_values','20260609011000_member_merge',
  '20260609012000_member_pr2_dimensions','20260609013000_sponsor_audience_member_view');"
```

No schema or row data is affected by either applying or rolling back this window.

---

## 7. After the window

- Notify Producer the window is closed.
- Going forward, keep the CLAUDE.md additive workflow (edit schema → `generate` → review
  `migrate diff` → apply additive SQL on `DIRECT_URL`), **but record each change as a tracked
  migration** (author the `prisma/migrations/<ts>_<name>/migration.sql`, then `resolve --applied`)
  so history never drifts again. The `prisma/sql/*.sql` files now each point to their tracked
  mirror.
