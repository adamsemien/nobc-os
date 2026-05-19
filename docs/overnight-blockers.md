# Overnight Build — Blockers

Run date: 2026-05-18 (ticketing-v2-with-tags build)

---

## BLOCKER 1 — Migration not applied (production-DB drift)

**Status:** Migration SQL prepared and reviewed. **NOT applied to the database.**

**Phase:** 1 (apply migration)

### What happened

The plan authorized `prisma migrate dev --name ticketing-v2-with-tags`. That command
cannot run: the live Neon Postgres has 3 columns on the `RSVP` table
(`amountCents`, `capturedAt`, `paymentStatus`) that were applied outside migration
history in a prior session. `prisma migrate dev` detects this as drift and offers
only `prisma migrate reset` — which drops all data and is forbidden in production.

This database is **shared with Producer**, so a reset is not an option under any
circumstance.

### Evidence gathered (read-only)

`prisma migrate diff --from-config-datasource --to-schema ./prisma/schema.prisma --script`
was run (read-only — no DB writes). The resulting SQL:

- Is **purely additive**: 10 `CREATE TYPE`, 13 new `Event` columns, 7 new `RSVP`
  columns (all nullable / defaulted — no backfill), 12 new tables, indexes, FKs.
- Contains **no `DROP` statements**.
- Does **not** re-add `amountCents` / `capturedAt` / `paymentStatus` to `RSVP`,
  which confirms those drifted columns already exist in the live DB. The drift is
  a migration-history bookkeeping gap, **not** a real schema conflict.

The reviewed SQL has been saved as a ready-to-apply migration:

    prisma/migrations/20260518130000_ticketing_v2_with_tags/migration.sql

(XOR `CHECK` constraints for `TicketTier` / `PromoCode` / `Order` are appended at
the end — the plan's snake_case column names were corrected to Prisma's camelCase.)

### Why it was not applied

Applying a migration to a Producer-shared production database is a hard-to-reverse,
unattended action. The project rule in CLAUDE.md is explicit:
"Schema changes: generate then push manually. Show the diff. Never auto-push."
The literally-authorized command (`prisma migrate dev`) is not executable here, and
substituting a different production-write path unattended is out of scope for an
overnight run. Conservative choice: prepare, do not apply.

### Recommended apply path (for Adam — needs a human)

`prisma migrate dev` will keep walling on the drift. Use `migrate deploy`, which
applies un-applied migration files without the drift/reset check:

    # 1. Review the prepared migration:
    less prisma/migrations/20260518130000_ticketing_v2_with_tags/migration.sql

    # 2. Apply it (no reset, no data loss — purely additive):
    ./node_modules/.bin/prisma migrate deploy

    # 3. Confirm the client matches:
    ./node_modules/.bin/prisma generate

Note: the pre-existing RSVP drift (3 columns) will remain unexplained by migration
history even after this. That is a separate, pre-existing cleanup — a tiny
follow-up migration with `ADD COLUMN IF NOT EXISTS` for those 3 columns would
close it. Not done here to keep this migration focused.

Caveat: the migration includes `ALTER TYPE "PaymentStatus" ADD VALUE` (x2). On
Neon (Postgres 15+) this runs fine; the new values are not used within the same
migration transaction.

### Impact on the rest of the build

Phases 2–5 are code (CRUD, UI, MCP stubs). They were written and type-checked
against the regenerated Prisma client, which already reflects the new schema.
They will compile, but any runtime DB call against the new tables will fail until
`migrate deploy` is run. Per the plan's test discipline (`typecheck` + `lint`,
not runtime tests), this is acceptable for the overnight pass.

---
