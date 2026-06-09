# Phase 0 — Producer `db push` Landmine: Mitigation Runbook

> **Handoff for the Producer (Replit) session.** This neutralizes the most urgent
> cross-app risk in `PRODUCER-OPERATOR-STRATEGY.md` §4. It is **safe to adopt
> immediately, regardless of the Phase 0 schema-isolation verdict.** Drafted
> 2026-06-09. Owner: Adam.

---

## The threat in one sentence

Producer and NoBC Operator share **one physical Postgres** (Neon `neondb`), and
Producer's documented schema workflow is **`prisma db push --skip-generate`** —
a command that reconciles the database toward *Producer's* Prisma schema and
**deletes any object it considers drift**, which on a shared schema includes
Operator's tables and indexes.

## What's already confirmed (Operator side, verified locally)

- Operator's `DATABASE_URL` has **no `?schema=`** → it uses the default **`public`** schema.
- Operator's `schema.prisma` has **no `multiSchema` / `schemas[]`** → everything is in `public`.
- Operator connects as **`neondb_owner`** — the database owner role (full DDL rights).
- Operator's `CLAUDE.md` proves the destructive behavior: a `db push` "treats
  `Asset_searchVector_idx` as drift and removes it" — that GIN index powers DAM
  full-text search and exists **only in prod** (created out-of-band via
  `prisma/sql/dam-search-vector.sql`, not representable in `schema.prisma`).

**Therefore:** if Producer connects with the same `DATABASE_URL` (no distinct
`?schema=`), the two apps collide in `public` as the same owner role, and
Producer's `db push` can drop Operator's objects — and Operator's would drop
Producer's. The Phase 0 query (below) confirms this against the live DB; **the
mitigation does not wait on it.**

---

## IMMEDIATE action (today — no coordination, no prod window)

In the **Producer repo**:

1. **Stop running `prisma db push` / `db push --skip-generate` against the shared
   Neon `DATABASE_URL`.** Remove it from:
   - `package.json` scripts (any `db:push`, `prisma db push`, `--skip-generate`).
   - Deploy / CI steps and Replit run commands.
   - Any "how to change the schema" docs or READMEs.
2. **Never use `--accept-data-loss`** against this database.
3. **Disable any auto-migrate-on-deploy** that runs `db push` or
   `migrate deploy` automatically on the shared DB.

This kills the active threat. Nothing downstream depends on it.

## INTERIM safe workflow (until schema isolation lands)

Until the apps are isolated, **both apps must treat the shared DB as Operator
already does** — additive-only, reviewed, coordinated:

1. Edit `schema.prisma`.
2. `prisma generate` (client only — never touches the DB).
3. `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script`
   and **review the SQL. Refuse any `DROP`, `ALTER TYPE`, or `RENAME`.**
4. Apply additive SQL with `prisma db execute --file <migration.sql>`.
5. **Coordinate with Adam / Operator before applying** — it's a shared DB; a
   change from either side is production-affecting for both.

> Note: this is an interim brake, not the destination. Two repos writing additive
> migrations into one shared `public` schema still have two migration histories on
> one schema — workable with coordination, but the durable fix is isolation (below).

## DURABLE fix (the Phase 0 outcome → coordinated window)

Phase 0 decides which:

- **If colliding in `public`:** isolate the apps — give Producer its own Postgres
  **schema** (`?schema=producer` + Prisma `multiSchema`, or a separate logical DB),
  and grant each app a **scoped DB role** that can only touch its own schema
  (this also closes zero's **G6** — "one Postgres role, no RLS"). This is a DDL
  migration for the **coordinated Producer window**, sequenced *with* the Operator
  migration-history reconciliation (flux PR #57) — reconciling history is wasted
  if a `db push` can still nuke it.
- **If already isolated (separate schema):** the immediate ban is just good
  hygiene; proceed to crest's spine work.

## The Phase 0 query (READ-ONLY — run in the Neon Console)

```sql
-- 1) Schemas + table counts (non-system)
SELECT table_schema, count(*) AS tables
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema')
GROUP BY 1 ORDER BY 1;

-- 2) Are Operator + Producer tables co-located in one schema?
SELECT schemaname, tablename, tableowner FROM pg_tables
WHERE tablename IN
  ('Member','RSVP','Ticket','Asset','Workspace',                 -- Operator
   'Vendor','DirectoryPerson','DirectoryCompany','EventSponsor')  -- Producer
ORDER BY schemaname, tablename;

-- 3) Login roles + superuser status (G6: one role = no isolation)
SELECT rolname, rolsuper, rolcanlogin FROM pg_roles WHERE rolcanlogin ORDER BY 1;

-- 4) Any RLS anywhere? (expected: zero)
SELECT count(*) AS tables_with_rls FROM pg_tables WHERE rowsecurity = true;
```

**Verdict:** query 2 all in `public` + query 3 one owner role → 🔴 collision, no
isolation → adopt the immediate ban now, schedule the durable fix for the window.

## Checklist for the Producer session

- [ ] Remove `prisma db push` from Producer scripts / CI / deploy / docs.
- [ ] Confirm no `--accept-data-loss` anywhere.
- [ ] Confirm no auto-migrate-on-deploy against the shared `DATABASE_URL`.
- [ ] Report Producer's connection string schema (`?schema=` present? value?).
- [ ] Run the Phase 0 query; paste results back for the isolation verdict.
- [ ] Adopt the interim additive-only workflow for any schema change.
