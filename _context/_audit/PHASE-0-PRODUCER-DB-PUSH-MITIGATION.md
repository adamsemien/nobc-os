# Phase 0 — Producer `db push` Landmine: Mitigation Runbook

> **Handoff for the Producer (Replit) session.** Cheap insurance against a
> cross-app `db push` accident. Drafted 2026-06-09. Owner: Adam.
>
> **⚠️ 2026-06-09 UPDATE — DOWNGRADED FROM EMERGENCY TO INSURANCE.** Live config
> shows Producer and Operator are on **separate databases** (Producer dev →
> `helium/heliumdb` Replit-managed; NoBC → `ep-twilight-forest-…neon.tech`) and
> **separate Clerk apps**. So the original "shared Postgres → mutual `db push`
> destruction" threat is **NOT active in any verified environment** — different
> DBs can't drop each other's objects. The only unverified gap is Producer's
> *production* `DATABASE_URL` (Doppler prod), and Producer has **no prod
> environment** yet. **Adopt the immediate `db push` ban below anyway** — it costs
> nothing, it's correct practice on a Replit-managed DB regardless, and it makes
> the shared-DB scenario safe *if* prod is ever wired that way. Just don't treat
> it as a fire.

---

## The risk (conditional — only bites if prod is shared)

`prisma db push` reconciles a database toward the calling app's Prisma schema and
**deletes any object it considers drift** (proven on Operator's side: it drops the
`Asset_searchVector_idx` DAM GIN index, which exists only in prod). **IF** Producer
were ever pointed at NoBC's database with no distinct `?schema=`, its documented
`db push --skip-generate` could drop Operator's tables and indexes. As verified
today that is **not** the case (separate DBs), so this is precautionary.

## What's confirmed (both sides, 2026-06-09)

- **Separate databases (dev):** Producer → `helium/heliumdb`; NoBC → Neon `ep-twilight-forest-…`.
- **Separate Clerk apps:** Producer (`firm-weevil-76` / key `maximum-chipmunk-4`, no prod env) ≠ NoBC (`allowed-zebra-34` dev / `app.thenobadcompany.com` prod).
- Operator side: `DATABASE_URL` has no `?schema=` (uses `public`), no `multiSchema`, connects as `neondb_owner`. Relevant only *if* the two ever share a DB.
- **Unverified:** Producer's *production* `DATABASE_URL`. Confirm before anyone wires the two together.

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
