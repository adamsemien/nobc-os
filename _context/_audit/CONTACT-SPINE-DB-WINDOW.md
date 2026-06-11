# Contact-Spine DB Window — Turnkey Runbook (#57 → #92)

**Owner:** Adam · **Created:** 2026-06-11
**Unblocks:** the CRM persist layer — saved CSV import, Producer ingestion, the unified
contact roster. Everything downstream of the connectors waits on this one window.

> **What this window does, in one line:** reconcile migration history (PR #57), then add
> the Contact-spine schema (PR #92's `ContactRole` enum + `Member.roles` + `ContactSource`
> table) to the live Neon DB — **additively, zero data loss, never `db push`.**

> **Why coordinated:** Producer is a *separate* database (confirmed 2026-06-11), so this is
> Operator-internal and Producer-safe. The only shared-instance caution belongs to #57's
> metadata step; agree a short window where Producer runs no `prisma migrate` regardless.

---

## Order of operations (do not reorder)

1. **Merge the code** (safe, no DB touch) — owner merges, with Adam's ok:
   - **#57** (`chore/reconcile-migration-history`) — adds the 10 catch-up migrations + `prisma.config.ts`.
   - **#92** (`feature/crm-contact-spine-schema`) — adds `schema.prisma` models + `prisma/sql/additive_contact_spine.sql` + the tracked migration `20260611000000_contact_spine`.
   - Merging is decoupled from applying: code on `main` runs `prisma generate` only (no DDL, no migrate-deploy in CI/Vercel). The new `ContactSource` model is defined but unqueried until the persist layer ships, so `main` is safe with schema ahead of DB.

2. **Run #57's reconciliation** — follow `_context/MIGRATION-RECONCILIATION-RUNBOOK.md` end to end (§1 pre-coord → §5 post-checks). It is `migrate resolve --applied` only: **zero DDL, metadata rows in `_prisma_migrations`.** Stop here if its §5b offline diff shows anything other than the single expected `DROP INDEX "Asset_searchVector_idx"` false-drift line.

3. **Apply #92's Contact-spine schema** — §A below. This is the only step in this window that runs DDL, and it is fully additive + idempotent.

4. **Verify + record** — §B.

---

## §A — Apply the Contact-spine schema (the one DDL step)

Prereqs from #57's runbook are already set: `DIRECT_URL` = the **unpooled** Neon host (no
`-pooler` in the hostname), and the prisma alias:

```bash
alias prisma-cli='node node_modules/prisma/build/index.js'
```

Apply the additive SQL on the **unpooled** endpoint (required — it creates types), then
record the tracked migration so history stays clean:

```bash
# 1. Apply the additive DDL (CREATE TYPE x2, ADD COLUMN Member.roles, CREATE TABLE
#    ContactSource + indexes + FKs). Idempotent — safe to re-run.
DATABASE_URL="$DIRECT_URL" prisma-cli db execute \
  --file prisma/sql/additive_contact_spine.sql \
  --schema prisma/schema.prisma

# 2. Record it as applied (writes ONE _prisma_migrations row, ZERO further DDL).
prisma-cli migrate resolve --applied 20260611000000_contact_spine
```

> The `prisma/sql/additive_contact_spine.sql` file and the tracked
> `prisma/migrations/20260611000000_contact_spine/migration.sql` body are the **same
> idempotent DDL** — applying either is equivalent. Do **not** use `migrate deploy` or
> `db push`.

---

## §B — Verify + post-checks (read-only)

```bash
# ContactSource table exists, workspace-scoped unique index present:
psql "$DIRECT_URL" -c "\d \"ContactSource\""

# Member.roles column added (array of ContactRole), default empty:
psql "$DIRECT_URL" -c \
  "SELECT column_name, data_type, column_default FROM information_schema.columns
   WHERE table_name='Member' AND column_name='roles';"

# Both new enums present with the expected values:
psql "$DIRECT_URL" -c \
  "SELECT t.typname, count(e.*) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
   WHERE t.typname IN ('ContactRole','ContactSourceSystem') GROUP BY t.typname;"
# Expect ContactRole = 6, ContactSourceSystem = 6.

# History recorded:
psql "$DIRECT_URL" -c \
  "SELECT migration_name FROM _prisma_migrations WHERE migration_name='20260611000000_contact_spine';"
```

**Offline drift re-check** (same throwaway-shadow method as #57 §5b): after this window,
`migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script`
should STILL print only the one expected `DROP INDEX "Asset_searchVector_idx"` line — never
a line mentioning `ContactSource`, `ContactRole`, or `roles`. Anything else = incomplete; stop.

---

## §C — Rollback

The schema is additive, so rollback is only needed if you abort mid-window. It DOES drop the
new objects (they hold no production data yet — nothing references them until the persist
layer ships), so it is safe pre-launch only:

```bash
psql "$DIRECT_URL" <<'SQL'
DROP TABLE IF EXISTS "ContactSource";
ALTER TABLE "Member" DROP COLUMN IF EXISTS "roles";
DROP TYPE IF EXISTS "ContactRole";
DROP TYPE IF EXISTS "ContactSourceSystem";
DELETE FROM _prisma_migrations WHERE migration_name='20260611000000_contact_spine';
SQL
```

> Only run rollback before any persist code writes `ContactSource`/`roles` data. After the
> persist layer is live and rows exist, a rollback is a destructive migration — stop and
> coordinate.

---

## After the window — what unblocks immediately

- **Saved CSV import** — turn the #96 preview into a real import (write `Member` + `ContactSource` from the resolver's decisions).
- **Producer ingestion** — the persist adapter wrapping #95's resolver (`producer` source → `vendor` role + `ContactSource`).
- **Unified roster** — show contacts with source badges (operator / csv / producer) across the spine.

All three are pure follow-on code against the now-applied schema — no further DB window.
